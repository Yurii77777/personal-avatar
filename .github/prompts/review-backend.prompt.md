# Backend Review - Repository-Specific Overlay

**Extends**: `.github/prompts/review-base.prompt.md`

Use the base review prompt for structure, output format, deduplication rules, and review philosophy. This overlay defines all project-specific rules, patterns, and checks.

---

## Repository Context

- **Purpose**: RAG-powered AI avatar backend — answers questions grounded in an uploaded knowledge base
- **Tech Stack**: Node 22, TypeScript 5.8+, NestJS 11, Drizzle ORM, PostgreSQL 17 + pgvector, Jest
- **LLM**: Multi-provider via strategy pattern (Gemini default, Anthropic Claude fallback)
- **Embeddings**: `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2, 384 dimensions)
- **File Parsing**: pdf-parse, mammoth (DOCX), marked (Markdown)
- **Architecture**: Feature-based NestJS modules, single DB schema file, inline DTOs
- **Monorepo**: Yarn workspaces (`backend`, `web-client`)
- **API**: Global prefix `/api`, URI versioning `/api/v1/*`, Swagger at `/api/docs`

---

## File Type Handling (Extends Base)

**ALSO REVIEW IN DETAIL:**

- Database schema (`backend/src/db/schema.ts`)
- Drizzle config (`backend/drizzle.config.ts`)
- NestJS module files (`*.module.ts`)
- Docker and Compose files (`Dockerfile`, `docker-compose.yml`)
- Makefile targets

**ALSO SKIP:**

- HuggingFace model cache files
- Drizzle migration snapshots (`drizzle/meta/`)

---

## Project Severity Rules

These map to the base prompt's generic severity tiers. Use the base definitions for general issues; use these for project-specific violations.

### CRITICAL

| Rule | Why |
|------|-----|
| Hardcoded secrets or API keys in source code | Must use environment variables via `@nestjs/config` — credentials exposed in version control |
| Magic strings (URLs, error messages, config values inline) | Must extract to configuration, constants, or env variables — brittle, hard to maintain |
| Magic numbers (thresholds, limits, sizes inline) | Must extract to named constants or configuration — unclear intent, easy to drift |
| Direct `process.env` access | Must use `@nestjs/config` `ConfigService` or `configuration.ts` — bypasses typed config validation |
| Separate DTO files | DTOs must be inline in controller files with `class-validator` decorators — project convention |
| Separate type definition files | Must use Drizzle inferred types (`typeof table.$inferSelect`) from `schema.ts` — no drift from DB |
| `@Global()` on feature modules | Only `DrizzleModule` is `@Global()` — feature modules must explicitly import dependencies |
| Real API calls in tests | Must mock external SDKs (Anthropic, Google, HuggingFace) — no real API calls in tests |
| `enum` keyword | Use `as const` objects — zero runtime cost, full literal inference |
| Synchronous import of `@huggingface/transformers` | Must use dynamic `await import()` in `onModuleInit()` — ESM compatibility |
| Untyped `throw new Error(...)` | Must use NestJS `HttpException` subclasses — generic errors leak internals to API consumers |
| Swallowed errors (empty catch block) | Must log or rethrow — silent failures hide production bugs |
| Sensitive data in error responses (stack traces, DB details, file paths) | Must return safe error shape — internal structure exposed to clients |
| `console.log` / `console.warn` / `console.error` | Must use NestJS `Logger` — no centralized control, missing context |
| PII in log output (email, API keys, document content, embedding vectors) | Must sanitize before logging — compliance and security risk |
| Fire-and-forget promises (async call without `await`) | Must await or explicitly handle — unhandled rejections crash the process |
| Raw SQL with string interpolation from user input | Must use Drizzle parameterized queries — SQL injection risk |
| `DELETE` / `UPDATE` without `WHERE` clause | Must always scope mutations — full-table wipe risk |
| Dependencies with known critical/high CVEs | Must resolve before merge — `npm audit` / `yarn audit` |
| Importing package not in `package.json` | Phantom dependency from hoisting — breaks when hoisting changes |

### HIGH

| Rule | Why |
|------|-----|
| Missing `ValidationPipe` on new controllers/endpoints | Global pipe configured with `whitelist: true, transform: true` — unsanitized input |
| Schema definitions outside `backend/src/db/schema.ts` | Single schema file convention — prevents schema fragmentation |
| `@Injectable()` on LLM provider classes | Provider classes (`anthropic.provider.ts`, `gemini.provider.ts`) are plain classes — only `LlmService` is injectable |
| Missing `@Inject(DRIZZLE)` for DB access | Must use Symbol-based DI token — project convention for Drizzle injection |
| Drizzle DB typed with specific generic | Must type as `any` when injected — project convention for custom provider |
| Batch inserts without chunking | Must chunk in groups of 100 for large datasets — prevents memory exhaustion and query size limits |
| Missing `overrideProvider(DRIZZLE)` in test modules | Must mock database in unit tests — no real DB connections in unit tests |
| `interface` keyword for new types | Project uses `type` for consistency — `interface` only where declaration merging is needed |
| Embedding batch size not using constant | Must reference the configured batch size (32) — magic number |
| Missing error handling on file upload parsing | PDF/DOCX parsing can throw — must handle gracefully with meaningful error messages |
| Missing database transaction for multi-table writes | Must wrap related inserts/updates in `this.db.transaction()` — partial writes corrupt state |
| N+1 query pattern (individual queries in a loop) | Must batch or join — exponential DB load under scale |
| `SELECT *` equivalent (selecting all columns when subset needed) | Must select only required columns — bandwidth and memory waste |
| Missing index consideration for new `WHERE` / `ORDER BY` columns | Must add index or document why not — full table scan on production data |
| Missing timeout on external API calls (Anthropic, Gemini, HuggingFace) | Must set timeout or `AbortController` — hung requests block the event loop |
| Missing cleanup in `onModuleDestroy` (open connections, streams, intervals) | Must implement `OnModuleDestroy` — resource leak on graceful shutdown |
| Unbounded array growth (pushing in a loop without size guard) | Must cap or stream — OOM on large inputs |
| Missing request context in log entries (requestId, sessionId) | Must include correlation IDs — impossible to trace in production |
| Missing rate limiting on new public endpoints | Must apply `@nestjs/throttler` or equivalent — abuse vector |
| Missing pagination on list endpoints | Must support `limit` / `offset` or cursor — unbounded result sets |
| Schema changes that drop columns or tables | Must be additive-only or include data migration — data loss risk |
| Production dependency listed in `devDependencies` (or vice versa) | Must be in correct section — missing in production build or bloated image |

### MEDIUM

| Rule | Why |
|------|-----|
| Non-kebab-case filenames (new files only) | Existing files exempt — consistency for new code |
| Missing Swagger decorators on new endpoints | All endpoints documented at `/api/docs` — API discoverability |
| Chunk size / overlap not from configuration | Should be configurable, not hardcoded — tuning flexibility |
| Missing `.spec.ts` for new services | Test files colocated next to source — coverage expectations |
| Controller logic beyond request/response mapping | Business logic belongs in services — controllers should be thin |
| Unused imports or dead code in changed files | Clean code — only flag in changed lines |
| Missing cascade delete consideration for new relations | Knowledge chunks cascade on document delete — new relations need same consideration |
| Inconsistent API response envelope | All endpoints should return consistent shape — client parsing complexity |
| Missing `@ApiResponse` / `@ApiPropertyOptional` Swagger decorators | Undocumented error shapes — consumers guess at failure modes |
| Different date formats across endpoints | Must use ISO 8601 everywhere — parsing inconsistency |
| Tests only covering happy path | Must include error and edge cases — false confidence in correctness |
| Test descriptions that don't describe expected behavior | `'should work'` → `'should return 404 when document not found'` — unclear test intent |
| Missing boundary tests (empty file, max size, zero chunks) | Edge cases cause production surprises |
| Missing concurrent operation tests (parallel uploads, simultaneous asks) | Race conditions hidden until production load |

---

## Mandatory Project Patterns

### 1. Feature-Based NestJS Modules

Each feature gets its own directory with module, service, and controller:

```typescript
// CORRECT: Feature module with explicit imports
@Module({
  imports: [RagModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

// WRONG: Everything in AppModule, @Global() on feature module
@Global()
@Module({
  providers: [KnowledgeService, RagService, LlmService],
})
export class EverythingModule {}
```

**Check:** Module per feature directory, explicit imports/exports, `@Global()` only on `DrizzleModule`.

### 2. Inline DTOs with class-validator

DTOs defined directly in controller files — no separate DTO files:

```typescript
// CORRECT: Inline DTO in controller file
// session.controller.ts
class AskDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

@Controller('sessions')
export class SessionController {
  @Post('ask')
  ask(@Body() dto: AskDto) { ... }
}

// WRONG: Separate DTO file
// dto/ask.dto.ts
export class AskDto { ... }
```

### 3. Database Schema & Types

Single schema file with Drizzle inferred types:

```typescript
// CORRECT: All tables in schema.ts, types inferred from schema
import { knowledgeDocuments } from './db/schema';
type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

// CORRECT: Drizzle fluent API
const results = await this.db
  .select()
  .from(knowledgeChunks)
  .where(gt(similarity, minSimilarity))
  .orderBy(desc(similarity))
  .limit(limit);

// WRONG: Separate type file, QueryBuilder style
// types/knowledge.ts
export interface KnowledgeDocument { id: string; ... }
```

### 4. Drizzle DI Pattern

```typescript
// CORRECT: Symbol-based injection, typed as any
const DRIZZLE = Symbol('DRIZZLE');

@Injectable()
export class SomeService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}
}

// WRONG: String token, specific generic type
constructor(@Inject('DATABASE') private db: DrizzlePostgres<typeof schema>) {}
```

### 5. LLM Strategy Pattern

```typescript
// CORRECT: Plain class implementing interface
// llm-provider.interface.ts
export interface LlmProvider {
  generateAnswer(question: string, context: string, history: Message[]): Promise<LlmResponse>;
}

// gemini.provider.ts — NOT @Injectable()
export class GeminiProvider implements LlmProvider {
  generateAnswer(...) { ... }
}

// llm.service.ts — the single injectable
@Injectable()
export class LlmService {
  private provider: LlmProvider;

  constructor(private config: ConfigService) {
    this.provider = config.get('llm.provider') === 'anthropic'
      ? new AnthropicProvider(config)
      : new GeminiProvider(config);
  }
}

// WRONG: @Injectable() on provider class
@Injectable()
export class GeminiProvider { ... }
```

### 6. ESM Dynamic Imports

```typescript
// CORRECT: Dynamic import in lifecycle hook
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private pipeline: any;

  async onModuleInit() {
    const { pipeline } = await import('@huggingface/transformers');
    this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
}

// WRONG: Top-level import
import { pipeline } from '@huggingface/transformers';
```

### 7. No Magic Strings & Numbers

All literal values must be named constants or come from configuration:

```typescript
// CORRECT: Named constants
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const EMBEDDING_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 100;
const SIMILARITY_TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;
const EMBEDDING_DIMENSIONS = 384;
const UPLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024;

// CORRECT: Configuration via ConfigService
const port = this.configService.get<number>('port');
const provider = this.configService.get<string>('llm.provider');

// WRONG: Inline magic values
const chunks = this.chunkText(text, 512, 64);
if (similarity > 0.3) { ... }
for (let i = 0; i < rows.length; i += 100) { ... }
```

**Rules:**
- Numeric thresholds, limits, sizes → named constants at module/file level
- URLs, API paths, model names → configuration or constants
- Error messages → meaningful, but can be inline strings (not centralized)
- Environment-dependent values → `configuration.ts` via `@nestjs/config`

### 8. Batch Processing

```typescript
// CORRECT: Chunked batch inserts with named constant
const INSERT_BATCH_SIZE = 100;

for (let i = 0; i < chunkRows.length; i += INSERT_BATCH_SIZE) {
  await this.db
    .insert(knowledgeChunks)
    .values(chunkRows.slice(i, i + INSERT_BATCH_SIZE));
}

// CORRECT: Chunked embedding generation
const EMBEDDING_BATCH_SIZE = 32;

for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
  const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
  const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
  results.push(...embeddings);
}

// WRONG: No batching, magic numbers
await this.db.insert(knowledgeChunks).values(allRows);
```

### 9. Error Handling

```typescript
// CORRECT: NestJS HttpException subclasses with meaningful messages
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';

async findDocument(id: string) {
  const doc = await this.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  if (!doc.length) {
    throw new NotFoundException(`Document ${id} not found`);
  }
  return doc[0];
}

// CORRECT: Catch external errors, wrap with safe response
async parseFile(file: Express.Multer.File) {
  try {
    return await pdfParse(file.buffer);
  } catch (error) {
    this.logger.error('PDF parsing failed', { documentId, error: error.message });
    throw new BadRequestException('Failed to parse uploaded file');
  }
}

// WRONG: Generic Error — leaks internals
throw new Error(`Cannot connect to database at ${connectionString}`);

// WRONG: Swallowed error
try { await riskyOperation(); } catch (e) {}

// WRONG: Stack trace in response
throw new HttpException({ message: error.message, stack: error.stack }, 500);
```

**Rules:**
- Use `BadRequestException`, `NotFoundException`, `ConflictException`, etc.
- Log full error internally (`this.logger.error`), return safe message to client
- Never expose: stack traces, DB connection details, file system paths, SQL queries
- Empty catch blocks are always CRITICAL — at minimum log the error

### 10. Logging

```typescript
// CORRECT: NestJS Logger per service
import { Logger } from '@nestjs/common';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  async upload(file: Express.Multer.File) {
    this.logger.log(`Processing upload: ${file.originalname}, size=${file.size}`);
    // ...
    this.logger.log(`Upload complete: documentId=${doc.id}, chunks=${chunks.length}`);
  }
}

// CORRECT: Structured metadata in log entries
this.logger.error('Embedding generation failed', {
  documentId,
  chunkIndex,
  error: error.message,
});

// WRONG: console.log
console.log('Uploading file...');

// WRONG: PII in logs
this.logger.log(`User email: ${user.email}, API key: ${apiKey}`);

// WRONG: Full content in logs
this.logger.debug(`Chunk content: ${chunk.content}`);
this.logger.debug(`Embedding: ${JSON.stringify(embedding)}`);
```

**Log levels:**
- `error` — operation failed, requires attention
- `warn` — degraded behavior, fallback activated
- `log` — business events (upload started, session created, query answered)
- `debug` — development detail (chunk count, similarity scores, timing)

**NEVER log:** API keys, embedding vectors, full document content, user PII, database credentials.

### 11. Testing Patterns

```typescript
// CORRECT: Mock external SDKs
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockResolvedValue([]),
};

const module = await Test.createTestingModule({
  providers: [KnowledgeService],
})
  .overrideProvider(DRIZZLE)
  .useValue(mockDb)
  .compile();

// WRONG: Real database connection in unit tests
const module = await Test.createTestingModule({
  imports: [DrizzleModule],
}).compile();
```

**Rules:**
- Unit tests (`.spec.ts`): colocated next to source files
- E2E tests: in `backend/test/` directory
- Always mock: Anthropic SDK, Google GenAI SDK, HuggingFace transformers, database
- Use `overrideProvider(DRIZZLE)` for DB mocking

### Test Quality Requirements

```typescript
// CORRECT: Descriptive test name with expected behavior
describe('KnowledgeService', () => {
  describe('upload', () => {
    it('should create document and return chunk count for valid PDF', async () => { ... });
    it('should throw BadRequestException when file buffer is empty', async () => { ... });
    it('should throw BadRequestException when MIME type is unsupported', async () => { ... });
    it('should batch-insert chunks in groups of INSERT_BATCH_SIZE', async () => { ... });
  });
});

// WRONG: Vague test names, happy-path only
it('should work correctly', async () => { ... });
it('should upload', async () => { ... });
```

**Required test coverage per new service:**
- Happy path — normal operation
- Error cases — invalid input, external service failure, missing data
- Boundary values — empty input, max size, zero results
- Specific assertion on error type and message (not just "throws")

### 12. API Conventions

```typescript
// CORRECT: Versioned controller with global prefix
@Controller({ path: 'sessions', version: '1' })
export class SessionController { ... }
// Results in: /api/v1/sessions/*

// CORRECT: Multipart upload with size limit
@Post('upload')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_SIZE_BYTES } }))
async upload(@UploadedFile() file: Express.Multer.File) { ... }

// WRONG: Unversioned, no size limit
@Controller('sessions')
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
```

### 13. Constants & Types Style

```typescript
// CORRECT: as const for constant objects
export const SUPPORTED_MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  MARKDOWN: 'text/markdown',
  PLAIN_TEXT: 'text/plain',
} as const;

// CORRECT: Derive types from constants
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[keyof typeof SUPPORTED_MIME_TYPES];

// CORRECT: type keyword over interface
type RetrievedChunk = {
  id: string;
  content: string;
  similarity: number;
};

// WRONG: enum, interface, wide annotation
enum MimeType { PDF = 'application/pdf' }
interface RetrievedChunk { ... }
const TYPES: Record<string, string> = { ... } as const;
```

### 14. Environment Variables

New environment variables require updates in **all** of these locations:

1. `backend/src/config/configuration.ts` — typed config accessor
2. `.env.example` — placeholder value
3. `.env` — actual or placeholder value
4. `CLAUDE.md` — Environment variables table
5. `docs/STATUS.md` — Environment table

```typescript
// CORRECT: Access via configuration.ts
// configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
  },
});

// service.ts
const provider = this.configService.get<string>('llm.provider');

// WRONG: Direct process.env in service
const provider = process.env.LLM_PROVIDER || 'gemini';
```

### 15. Security Hardening

```typescript
// CORRECT: File type validation beyond extension (check magic bytes)
const ALLOWED_MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  MARKDOWN: 'text/markdown',
  PLAIN_TEXT: 'text/plain',
} as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[keyof typeof ALLOWED_MIME_TYPES];

async upload(@UploadedFile() file: Express.Multer.File) {
  if (!Object.values(ALLOWED_MIME_TYPES).includes(file.mimetype as AllowedMimeType)) {
    throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
  }
}

// CORRECT: Parameterized queries via Drizzle (safe by default)
const results = await this.db
  .select()
  .from(knowledgeChunks)
  .where(eq(knowledgeChunks.documentId, documentId));

// WRONG: String interpolation in raw SQL
const results = await this.db.execute(sql`
  SELECT * FROM knowledge_chunks WHERE document_id = '${userInput}'
`);

// CORRECT: Bounded query results
const MAX_DOCUMENTS_PER_PAGE = 50;
const docs = await this.db.select().from(knowledgeDocuments).limit(MAX_DOCUMENTS_PER_PAGE);

// WRONG: Unbounded SELECT
const allDocs = await this.db.select().from(knowledgeDocuments);
```

**Security checklist for new endpoints:**
- Input validated via `class-validator` + `ValidationPipe`
- File uploads: MIME type whitelist, size limit, no path traversal in filename
- Query results: always bounded with `LIMIT`
- Error responses: no internal details leaked
- Rate limiting applied via `@nestjs/throttler` on public endpoints

### 16. Database Safety

```typescript
// CORRECT: Transaction for multi-table write
async uploadDocument(file: Express.Multer.File) {
  return await this.db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(knowledgeDocuments)
      .values({ filename: file.originalname, mimeType: file.mimetype })
      .returning();

    const chunkRows = chunks.map((chunk, i) => ({
      documentId: doc.id,
      content: chunk,
      chunkIndex: i,
      embedding: embeddings[i],
    }));

    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH_SIZE) {
      await tx.insert(knowledgeChunks).values(chunkRows.slice(i, i + INSERT_BATCH_SIZE));
    }

    return doc;
  });
}

// WRONG: Separate queries without transaction — document exists but chunks missing on failure
const [doc] = await this.db.insert(knowledgeDocuments).values(...).returning();
await this.db.insert(knowledgeChunks).values(chunkRows); // fails → orphaned document

// CORRECT: Always scope mutations
await this.db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));

// WRONG: DELETE without WHERE — deletes entire table
await this.db.delete(knowledgeDocuments);
```

**Database rules:**
- Multi-table writes wrapped in `this.db.transaction()`
- All `DELETE` / `UPDATE` must have `WHERE` clause
- New columns with `WHERE` or `ORDER BY` usage need index consideration
- Schema changes must be additive (new columns, new tables) — drops require migration plan
- Connection pool limits considered for concurrent operations

### 17. Async & Resource Safety

```typescript
// CORRECT: Timeout on external API calls
const EXTERNAL_API_TIMEOUT_MS = 30_000;

async generateAnswer(question: string, context: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  try {
    return await this.provider.generate({ question, context, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// CORRECT: Cleanup on module destroy
@Injectable()
export class SomeService implements OnModuleDestroy {
  private intervalRef: NodeJS.Timeout;

  onModuleDestroy() {
    clearInterval(this.intervalRef);
  }
}

// WRONG: Fire-and-forget
this.someAsyncMethod(); // no await — unhandled rejection

// WRONG: Unbounded array growth
const allEmbeddings: number[][] = [];
for (const doc of documents) {
  for (const chunk of doc.chunks) {
    allEmbeddings.push(await this.embed(chunk)); // OOM on large uploads
  }
}

// CORRECT: Process in bounded batches (see Pattern 8)
```

**Async rules:**
- Every `async` call must be `await`-ed or explicitly handled (`.catch()`)
- External API calls must have timeout (`AbortController` or SDK timeout option)
- Services holding resources (connections, intervals, streams) must implement `OnModuleDestroy`
- Large data processing must be streamed or batched — never accumulate unbounded in memory

### 18. API Contract Stability

```typescript
// CORRECT: Consistent response shape across all endpoints
// List endpoint with pagination support
@Get()
async list(
  @Query('limit', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) limit: number,
  @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
) {
  const documents = await this.knowledgeService.list(limit, offset);
  return { data: documents, limit, offset };
}

// CORRECT: Swagger response documentation
@ApiResponse({ status: 200, description: 'Document uploaded successfully' })
@ApiResponse({ status: 400, description: 'Invalid file type or empty file' })
@ApiResponse({ status: 413, description: 'File exceeds size limit' })
@Post('upload')
async upload(...) { ... }

// WRONG: Inconsistent — some endpoints wrap in { data }, others return raw array
@Get() list() { return this.service.findAll(); }       // returns []
@Get(':id') get() { return { data: this.service.find() }; } // returns { data: {} }
```

**API rules:**
- All dates in ISO 8601 format
- List endpoints must support pagination (`limit` + `offset` or cursor)
- Error responses: consistent `{ statusCode, message, error }` shape (NestJS default)
- New endpoints must have `@ApiResponse` decorators for success and error cases
- Response shape changes require API version bump

### 19. Docker & Infrastructure

```dockerfile
# CORRECT: Multi-stage build, non-root user, .dockerignore
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-alpine AS production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER app
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main"]

# WRONG: Single stage, running as root, no health check
FROM node:22
COPY . .
RUN npm install
CMD ["npm", "start"]
```

**Docker rules:**
- Multi-stage builds — dev dependencies excluded from production image
- Non-root user (`USER app`) — never run as root in container
- `.dockerignore` must exclude: `node_modules`, `.env`, `.git`, `dist`, `coverage`
- `HEALTHCHECK` directive in Dockerfile
- Pinned base image versions (not `latest` tag)
- No secrets in build args, `ENV`, or `COPY` directives

**docker-compose rules:**
- Resource limits (`mem_limit`, `cpus`) for production compose files
- Health checks with `interval`, `timeout`, `retries`
- Named volumes for data persistence
- No hardcoded credentials — use `.env` file reference

### 20. Dependency Hygiene

**CRITICAL:**
- Dependencies with known critical/high CVEs — run `yarn audit` before merge
- Importing a package not listed in `package.json` — phantom dependency from workspace hoisting

**HIGH:**
- Production dependency in `devDependencies` — missing in production `node_modules`
- Dev-only dependency in `dependencies` — bloated production image
- Multiple packages solving the same problem — pick one, remove others
- Missing peer dependency warnings from `yarn install`

**MEDIUM:**
- Outdated major versions without justification
- Unused dependencies in `package.json` (not imported anywhere in source)

---

## RAG Pipeline Checks

When reviewing changes to the RAG pipeline, verify:

| Component | Expected Behavior |
|-----------|-------------------|
| **Chunking** | Configurable chunk size and overlap (defaults: 512 chars, 64 overlap) |
| **Embeddings** | Xenova/all-MiniLM-L6-v2, 384 dimensions, dynamic ESM import, batch size 32 |
| **Vector storage** | pgvector column with HNSW index (`vector_cosine_ops`), batch insert 100 |
| **Retrieval** | Cosine similarity, top-K results (default 5), threshold filtering (default 0.3) |
| **Context injection** | Retrieved chunks joined as context, passed to LLM with conversation history |

---

## Architecture Awareness

### Current Phase: 1 (Foundation + Text Pipeline)

The project follows a 5-phase roadmap. When reviewing, be aware of:

- **Phase 1** (complete): Text pipeline, RAG, knowledge base CRUD, multi-provider LLM
- **Phase 2** (next): STT (Deepgram) + TTS (Chatterbox on RunPod) — WebSocket gateway
- **Phase 3**: Avatar lip-sync (MuseTalk on RunPod) — WebRTC streaming, web-client
- **Phase 4**: Google Meet integration — session orchestrator, full pipeline
- **Phase 5**: Production deployment, JWT auth, multi-tenant

**Do NOT flag** code as over-engineered if it prepares for upcoming phases (e.g., session management, user references in schema). **Do flag** premature implementation of future phase features in current PRs unless explicitly scoped.

### Monorepo Structure

```
personal-avatar/          # Root (yarn workspaces)
├── .github/              # GitHub config (workflows, prompts) — ALWAYS at repo root
├── backend/              # NestJS backend workspace
├── web-client/           # Future web client workspace
├── docs/                 # Documentation (PRD, STATUS, phase guides)
├── docker-compose.yml    # Dev infrastructure
├── Makefile              # Task runner
└── package.json          # Workspace root
```

---

## Review Workflow

1. **Scope check** — Identify changed files from PR diff. ONLY review those files
2. **PR size** — Flag PRs over 300 lines, request split over 600
3. **Base compliance** — Deduplication, severity levels, output format, commit messages
4. **Breaking changes** — API shape changes, env var removals, schema drops need migration path
5. **Security** — No secrets, validated input, parameterized queries, bounded results, rate limiting
6. **Project rules** — All mandatory patterns from this overlay (applied to changed code only)
7. **Magic values** — No hardcoded strings, numbers, URLs, or config values inline
8. **Error handling** — HttpException subclasses, no swallowed errors, safe error responses
9. **Logging** — NestJS Logger (no console), no PII, structured metadata, correlation IDs
10. **Module architecture** — Feature-based modules, correct DI patterns, explicit imports
11. **Database** — Schema in single file, transactions for multi-table writes, bounded queries, batch ops
12. **Async safety** — All promises awaited, timeouts on externals, OnModuleDestroy cleanup
13. **API contracts** — Consistent response shape, pagination, Swagger docs, ISO 8601 dates
14. **Testing** — Mocked externals, overrideProvider(DRIZZLE), happy + error + boundary cases
15. **Docker** — Multi-stage, non-root, health checks, no secrets in image
16. **Dependencies** — No CVEs, correct dep section, no phantoms, no duplicates
17. **RAG pipeline** — Correct embedding flow, similarity search, context injection
