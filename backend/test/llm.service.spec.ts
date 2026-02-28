import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../src/llm/llm.service';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'I have 5 years of experience in TypeScript.' }],
      }),
    },
  }));
});

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'llm.provider': 'anthropic',
                'anthropic.apiKey': 'test-key',
                'anthropic.model': 'claude-haiku-4-5-20241022',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate an answer from context', async () => {
    const result = await service.generateAnswer(
      'What is your experience?',
      'I have 5 years of TypeScript experience working on NestJS backends.',
    );

    expect(result).toHaveProperty('answer');
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('should pass conversation history to the API', async () => {
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ];

    const result = await service.generateAnswer(
      'Tell me about your skills',
      'TypeScript, NestJS, PostgreSQL',
      history,
    );

    expect(result).toHaveProperty('answer');
  });
});
