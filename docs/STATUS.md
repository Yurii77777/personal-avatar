# Project Status

**Last updated**: 2026-03-05

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
- pnpm workspaces (`pnpm-workspace.yaml`): `backend`, `web-client`, `packages/*`
- `packages/shared` (`@avatar/shared`) — shared TypeScript types (voice event interfaces), no build step (raw TS via exports)
- `web-client` workspace — Svelte 5 voice testing UI (Vite + TypeScript)

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

## Phase 2: Voice Pipeline — STT + TTS (COMPLETE)

**Backend modules:**
- `audio/` — AudioService with WAV/PCM utilities (pcmToWav, wavToPcm, base64 conversion, metadata parsing)
- `tts/` — TTS strategy pattern: TtsProvider interface → ElevenLabsTtsProvider (API, 30s timeout, PCM 24kHz output)
- `stt/` — SttService wraps @deepgram/sdk for streaming transcription; SttGateway WebSocket on `/voice` namespace

**TTS pivot:** Originally planned RunPod + Chatterbox (self-hosted GPU). Switched to ElevenLabs API — no GPU infra needed, built-in voice cloning, free tier for testing, lower latency (~1-2s vs 30-60s cold start).

**WebSocket flow (Socket.IO `/voice` namespace):**
1. Client sends `start-session` → server creates Deepgram live session
2. Client streams `audio-chunk` (raw PCM binary) → forwarded to Deepgram
3. Server emits `transcript` (interim/final) in real-time
4. On utterance end → joins final transcripts → calls SessionService.ask() → emits text `answer`
5. After answer: calls TtsService.synthesize() → emits `audio` (base64 WAV)
6. TTS failure → graceful degradation: text answer already delivered, emits `tts-error`

**New dependencies:** `@deepgram/sdk`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`

**Web client:** Migrated from Vanilla TS to **Svelte 5** (runes, scoped CSS, Vite plugin). Pure logic files (`voice-client.ts`, `audio-recorder.ts`, `pcm-processor.ts`) moved to `src/lib/`. Imperative DOM code (`ui.ts`, `audio-player.ts`) replaced with reactive `App.svelte`.

---

## Not started

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
  "postgres": "^3.4.5",
  "@deepgram/sdk": "^4.11.3",
  "@nestjs/websockets": "^11.1.14",
  "@nestjs/platform-socket.io": "^11.1.14",
  "socket.io": "^4.8.3"
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
| `DEEPGRAM_API_KEY` | — | For voice pipeline |
| `DEEPGRAM_MODEL` | `nova-3` | No |
| `DEEPGRAM_LANGUAGE` | `en` | No |
| `ELEVENLABS_API_KEY` | — | For TTS |
| `ELEVENLABS_VOICE_ID` | — | Cloned voice ID |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | No |
