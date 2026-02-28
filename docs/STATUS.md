# Project Status

**Last updated**: 2026-02-25

## Current phase: 1 — Foundation + Text Pipeline (COMPLETE)

### What's built

**Backend (NestJS 11 + TypeScript 5.8)**
- `app.module.ts` — root module wiring ConfigModule, DrizzleModule, RagModule, KnowledgeModule, LlmModule, SessionModule
- `main.ts` — bootstrap with `/api` prefix, URI v1 versioning, ValidationPipe (whitelist + transform), Swagger at `/api/docs`
- `config/configuration.ts` — typed env config (PORT, DATABASE_URL, LLM_PROVIDER, Anthropic + Gemini keys/models)
- `db/drizzle.module.ts` — `@Global()` module, Symbol-based DI (`DRIZZLE`), postgres-js driver
- `db/schema.ts` — 5 tables: users, knowledgeDocuments, knowledgeChunks (384-dim pgvector + HNSW index), sessions, sessionMessages
- `knowledge/` — file upload (PDF, DOCX, MD, TXT), `RecursiveCharacterTextSplitter` (512 chars, 64 overlap, semantic boundaries), batch embedding + transactional insert (100 per batch)
- `rag/embedding.service.ts` — `@huggingface/transformers` dynamic ESM import, `Xenova/all-MiniLM-L6-v2`, batch size 32
- `rag/rag.service.ts` — cosine similarity search, top 5 results, threshold > 0.15
- `llm/` — Multi-provider LLM via strategy pattern (`LlmProvider` interface, `AnthropicProvider`, `GeminiProvider`); `LlmService` orchestrator selects provider from `LLM_PROVIDER` env; defaults to Gemini (free tier); 30s API timeout via AbortController
- `session/session.service.ts` — business logic: session create/resume, conversation history, RAG context injection
- `session/session.controller.ts` — thin HTTP layer, `POST /ask` with inline `AskDto`
- `constants.ts` — shared constants (chunk sizes, thresholds, batch sizes, timeouts)
- `health/health.controller.ts` — `GET /health` returns `{ status: 'ok' }`

**Infrastructure**
- `Dockerfile` — multi-stage node:22-slim (builder → production), non-root `node` user, HEALTHCHECK
- `.dockerignore` — excludes node_modules, dist, .env*, .git, coverage, *.md
- `docker-compose.yml` — `pgvector/pgvector:pg17` with healthcheck + backend service with source volume mount
- `backend/init.sql` — `CREATE EXTENSION IF NOT EXISTS vector`
- `Makefile` — dev, up, down, logs, migrate, test, test-e2e, build targets
- `drizzle.config.ts` — schema push config (no migration files, uses `drizzle-kit push`)

**Monorepo**
- Root `package.json` — npm workspaces: `backend`, `web-client`
- `web-client` workspace declared but not yet created

### API endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/v1/health` | Done |
| POST | `/api/v1/knowledge/upload` | Done — multipart, 10MB limit |
| GET | `/api/v1/knowledge` | Done — list documents (paginated: `?limit=50&offset=0`) |
| DELETE | `/api/v1/knowledge/:id` | Done — cascade deletes chunks |
| POST | `/api/v1/sessions/ask` | Done — RAG + LLM + history |

### Database schema

```
users (id, name, email, created_at)
knowledge_documents (id, user_id, filename, mime_type, chunks_count, created_at)
knowledge_chunks (id, document_id, content, chunk_index, embedding[384], created_at)
  └─ HNSW index on embedding (vector_cosine_ops)
sessions (id, user_id, created_at, updated_at)
session_messages (id, session_id, role[user|assistant], content, created_at)
```

### What's missing from Phase 1

- **Tests** — `test/llm.service.spec.ts` exists; more unit/integration tests needed
- **e2e tests** — `test/` directory not created

---

## Not started

### Phase 2: Voice Pipeline — STT + TTS
- Deepgram streaming STT (WebSocket gateway)
- Chatterbox TTS on RunPod Serverless
- Voice clone setup
- Audio format conversion utilities

### Phase 3: Avatar — Lip Sync + Visual
- MuseTalk 1.5 avatar worker on RunPod
- Face data preparation
- WebRTC streaming (server → browser)
- `web-client/` — Vite + TS, `<canvas>` avatar renderer, audio capture

### Phase 4: Google Meet Integration
- Full real-time pipeline: Meet audio → STT → LLM+RAG → TTS → Avatar → Meet
- OBS Window Capture + Virtual Audio Cable integration
- Session orchestrator
- Idle animations

### Phase 5: Production + SaaS
- DigitalOcean deployment, Nginx + SSL
- JWT authentication
- Multi-tenant data isolation
- Ukrainian TTS
- Knowledge base + avatar setup UI

---

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.78.0",
  "@google/genai": "^1.42.0",
  "@huggingface/transformers": "^3.8.1",
  "@nestjs/common": "^11.1.14",
  "@nestjs/config": "^4.0.3",
  "@nestjs/core": "^11.1.14",
  "@nestjs/platform-express": "^11.1.14",
  "@nestjs/swagger": "^11.2.6",
  "class-transformer": "^0.5.1",
  "class-validator": "^0.14.3",
  "drizzle-orm": "^0.45.1",
  "mammoth": "^1.11.0",
  "marked": "^17.0.3",
  "@langchain/textsplitters": "^1.0.1",
  "pdf-parse": "^1.1.1",
  "postgres": "^3.4.5"
}
```

## Environment

| Variable | Default | Required |
|---|---|---|
| `PORT` | `3000` | No |
| `DATABASE_URL` | `postgresql://avatar:avatar@localhost:5432/avatar` | No |
| `LLM_PROVIDER` | `gemini` | No |
| `ANTHROPIC_API_KEY` | — | When `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20241022` | No |
| `GEMINI_API_KEY` | — | When `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | No |
