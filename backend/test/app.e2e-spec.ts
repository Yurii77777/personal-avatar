import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DRIZZLE } from '../src/db/drizzle.module';

// Mock the heavy dependencies for e2e testing
jest.mock('@huggingface/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    jest.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0.1),
    }),
  ),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'I am an AI avatar with extensive experience.' }],
      }),
    },
  }));
});

// Prevent real postgres connection
jest.mock('postgres', () => jest.fn(() => jest.fn()));
jest.mock('drizzle-orm/postgres-js', () => ({
  drizzle: jest.fn(() => ({})),
}));

// Awaitable chain (has .then), used for method returns
class AwaitableChain {
  private _resolveValue: any;
  constructor(resolveValue: any = []) {
    this._resolveValue = resolveValue;
  }
  select() { return new AwaitableChain(this._resolveValue); }
  from() { return new AwaitableChain(this._resolveValue); }
  where() { return new AwaitableChain(this._resolveValue); }
  orderBy() { return new AwaitableChain(this._resolveValue); }
  limit() { return new AwaitableChain(this._resolveValue); }
  insert() { return new AwaitableChain(this._resolveValue); }
  values() { return new AwaitableChain(this._resolveValue); }
  delete() { return new AwaitableChain(this._resolveValue); }
  returning() { return Promise.resolve([{ id: 'test-session-id', chunksCount: 3 }]); }
  then(resolve: any, reject?: any) {
    return Promise.resolve(this._resolveValue).then(resolve, reject);
  }
}

// Root mock DB — NOT thenable (no .then), so NestJS DI won't resolve it as a promise
function createMockDb() {
  return {
    select: () => new AwaitableChain([]),
    insert: () => new AwaitableChain([]),
    delete: () => new AwaitableChain([]),
  };
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(createMockDb())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  it('GET /api/v1/health → 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /api/v1/knowledge → 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/knowledge')
      .expect(200);
  });

  it('POST /api/v1/knowledge/upload without file → 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/knowledge/upload')
      .expect(400);
  });

  it('POST /api/v1/sessions/ask without body → 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sessions/ask')
      .send({})
      .expect(400);
  });

  it('POST /api/v1/sessions/ask with question → 201', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sessions/ask')
      .send({ question: 'What is your experience?' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('sessionId');
        expect(res.body).toHaveProperty('answer');
        expect(res.body).toHaveProperty('sources');
      });
  });
});
