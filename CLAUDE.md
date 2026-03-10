# Personal AI Avatar

RAG-powered AI avatar backend that answers questions grounded in an uploaded knowledge base.

## Tech stack

- **Runtime**: Node 22, TypeScript 5.8
- **Framework**: NestJS 11 (`@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`)
- **ORM**: Drizzle ORM 0.45 + drizzle-kit 0.31 (PostgreSQL via `postgres` driver)
- **Database**: PostgreSQL 17 with pgvector extension
- **LLM**: Multi-provider — Gemini (`gemini-2.5-flash` default, free tier) or Anthropic Claude Haiku; env-switched via `LLM_PROVIDER`
- **Embeddings**: `@huggingface/transformers` → `Xenova/all-MiniLM-L6-v2` (384-dim)
- **Text splitting**: `@langchain/textsplitters` → `RecursiveCharacterTextSplitter` (semantic boundary-aware)
- **File parsing**: pdf-parse, mammoth (docx), marked (markdown)
- **STT**: Deepgram SDK (`@deepgram/sdk`) → `nova-3` streaming transcription
- **TTS**: ElevenLabs API (`eleven_multilingual_v2` model, voice cloning via ElevenLabs dashboard)
- **WebSocket**: `@nestjs/websockets` + `socket.io` for real-time voice pipeline
- **Web client**: Svelte 5 (runes, scoped CSS) + Vite + TypeScript
- **Monorepo**: pnpm workspaces (`backend`, `web-client`, `packages/shared`)
- **Testing**: Jest + ts-jest, supertest for e2e

## Project structure

```
personal-avatar/
├── packages/
│   └── shared/                  # @avatar/shared — shared types (no build step)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts         # re-exports
│           └── voice-events.ts  # TranscriptEvent, AnswerEvent, etc.
├── backend/
│   ├── src/
│   │   ├── config/        # configuration.ts — typed env config
│   │   ├── db/            # drizzle.module.ts, schema.ts
│   │   ├── health/        # health.controller.ts
│   │   ├── knowledge/     # upload, list, delete documents
│   │   ├── llm/           # Multi-provider LLM (strategy pattern: Anthropic + Gemini)
│   │   ├── rag/           # embedding.service.ts, rag.service.ts
│   │   ├── session/       # conversational Q&A endpoint (service + controller)
│   │   ├── audio/         # audio.service.ts — WAV/PCM utilities (pcmToWav, wavToPcm, base64)
│   │   ├── tts/           # TTS strategy pattern (ElevenLabs provider)
│   │   ├── stt/           # Deepgram STT service + WebSocket gateway (/voice)
│   │   ├── constants.ts   # shared constants (chunk sizes, thresholds, timeouts)
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── drizzle.config.ts
│   ├── init.sql           # CREATE EXTENSION vector
│   ├── .dockerignore
│   └── Dockerfile         # multi-stage node:22-slim, pnpm, non-root user
├── web-client/
│   ├── src/
│   │   ├── main.ts            # Svelte mount entry point
│   │   ├── App.svelte         # all UI — state ($state runes), template, scoped styles
│   │   ├── app.css            # global styles (reset, body, h1, h2)
│   │   ├── vite-env.d.ts      # Svelte + Vite type references
│   │   └── lib/
│   │       ├── voice-client.ts    # Socket.IO wrapper for /voice namespace
│   │       ├── audio-recorder.ts  # mic → AudioWorklet → PCM 16kHz 16-bit mono
│   │       └── pcm-processor.ts   # AudioWorklet processor (Float32 → Int16)
│   ├── index.html
│   ├── svelte.config.js       # vitePreprocess() for <script lang="ts">
│   ├── vite.config.ts         # Vite + svelte() plugin
│   ├── tsconfig.json
│   └── package.json           # Svelte 5 + Vite + TypeScript
├── scripts/
│   ├── test-voice.mjs        # WebSocket connection test
│   └── test-voice-full.mjs   # Full voice pipeline test with WAV file
├── pnpm-workspace.yaml        # workspace: backend, web-client, packages/*
├── docker-compose.yml
├── Makefile
├── docs/PRD.md
└── package.json               # root (no workspaces field — pnpm uses pnpm-workspace.yaml)
```

## Conventions

### Modules
- Feature-based NestJS modules: each feature gets its own directory with module/service/controller
- Feature modules export services, import dependencies (e.g., KnowledgeModule imports RagModule)
- `@Global()` only for cross-cutting modules (DrizzleModule)
- DrizzleModule uses `DRIZZLE` Symbol for DI — inject with `@Inject(DRIZZLE)`

### DTOs
- Inline DTOs in controller files using class-validator decorators — no separate DTO files
- Example: `class AskDto` defined in `session.controller.ts`

### Database
- Single schema file: `backend/src/db/schema.ts` — all tables defined here
- Use Drizzle types from schema (e.g., `typeof users.$inferSelect`) — no separate type files
- Drizzle fluent API: `.select().from(table).where(...).orderBy(...)`
- Batch inserts in groups of `INSERT_BATCH_SIZE` (100) for large datasets
- Document insert + chunk inserts wrapped in a transaction (`db.transaction`)
- `drizzle-kit push` for dev schema sync (no migration files)

### ESM dynamic imports
- `@huggingface/transformers` must be imported dynamically: `await import('@huggingface/transformers')`
- Load in `onModuleInit()` lifecycle hook

### Typing
- Drizzle DB instance typed as `any` when injected (no generic type param for the custom provider)

## RAG pipeline

1. **Ingest**: Upload file → parse (PDF/DOCX/MD/TXT) → split via `RecursiveCharacterTextSplitter` (512 chars, 64 overlap, separators: `\n\n`, `\n`, `. `, `? `, `! `, ` `)
2. **Embed**: `Xenova/all-MiniLM-L6-v2` → 384-dim vectors, batch size 32
3. **Store**: pgvector column with HNSW index (`vector_cosine_ops`), transactional insert
4. **Retrieve**: Cosine similarity search, top 5 results, threshold > 0.15
5. **Generate**: Inject retrieved chunks as context → configured LLM provider generates answer (30s timeout)

## API

- Global prefix: `/api`
- URI versioning: `/api/v1/*`
- `ValidationPipe` with `whitelist: true, transform: true`
- Swagger docs at `/api/docs`
- Endpoints:
  - `GET  /api/v1/health` — health check
  - `POST /api/v1/knowledge/upload` — multipart file upload (10MB limit)
  - `GET  /api/v1/knowledge` — list documents (paginated: `?limit=50&offset=0`)
  - `DELETE /api/v1/knowledge/:id` — delete document
  - `POST /api/v1/sessions/ask` — ask a question (body: `{ question, sessionId? }`)
- WebSocket namespace: `/voice` (Socket.IO)
  - Client → Server: `start-session`, `audio-chunk` (binary PCM), `stop-session`
  - Server → Client: `session-started`, `transcript`, `processing`, `answer`, `audio`, `tts-error`, `error`

## Testing

- Mock external SDKs (Anthropic, HuggingFace) — never call real APIs in tests
- Use `overrideProvider(DRIZZLE)` in test modules to mock the database
- Test files colocated: `*.spec.ts` next to source files; e2e tests in `backend/test/`

## Commands

```bash
# Dev
make dev                    # nest start --watch
make dev-client             # vite dev server (port 5173)
make migrate                # drizzle-kit push

# Docker
make up                     # docker-compose up --build -d
make down                   # docker-compose down
make logs                   # docker-compose logs -f

# Test & Build
make test                   # jest
make test-e2e               # jest --config jest-e2e.json
make build                  # nest build
make build-client           # vite build

# pnpm workspace commands
pnpm install                                    # install all workspace deps
pnpm --filter personal-avatar-backend run build  # build specific workspace
pnpm --filter web-client run dev                 # run specific workspace script
```

### LLM providers
- Strategy pattern: `LlmProvider` interface in `llm-provider.interface.ts`
- Provider classes (`anthropic.provider.ts`, `gemini.provider.ts`) are plain classes, not `@Injectable`
- `LlmService` is the single injectable — instantiates provider based on `llm.provider` config
- Both providers use `AbortController` with 30s timeout (`EXTERNAL_API_TIMEOUT_MS`)
- `SessionService` handles business logic; `SessionController` is a thin HTTP layer

### TTS providers
- Same strategy pattern as LLM: `TtsProvider` interface in `tts-provider.interface.ts`
- `ElevenLabsTtsProvider` is a plain class (NOT `@Injectable`), uses native `fetch()` + `AbortController` with `TTS_TIMEOUT_MS` (30s)
- Returns raw PCM (24kHz) — gateway wraps in WAV via AudioService
- `TtsService` is the single injectable — instantiates provider, handles text validation/truncation

### STT + Voice pipeline
- `SttService` wraps `@deepgram/sdk` — creates live WebSocket sessions to Deepgram, tracks active sessions, cleans up on module destroy
- `SttGateway` is a NestJS `@WebSocketGateway` on `/voice` namespace — manages per-client state, orchestrates STT → RAG+LLM → TTS flow
- TTS failure is graceful: text answer is emitted before TTS, so client always gets the answer even if audio fails

## Checklist — when adding new environment variables

1. Add to `backend/src/config/configuration.ts`
2. Add to `.env.example` (with placeholder value)
3. Add to `.env` (with placeholder or real value)
4. Update the Environment variables table below
5. Update `docs/STATUS.md` Environment table

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `postgresql://avatar:avatar@localhost:5432/avatar` | Postgres connection |
| `LLM_PROVIDER` | `gemini` | LLM provider: `gemini` or `anthropic` |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20241022` | Claude model ID |
| `GEMINI_API_KEY` | — | Required when `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model ID |
| `DEEPGRAM_API_KEY` | — | Deepgram STT API key |
| `DEEPGRAM_MODEL` | `nova-3` | Deepgram STT model |
| `DEEPGRAM_LANGUAGE` | `en` | STT language |
| `ELEVENLABS_API_KEY` | — | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | — | ElevenLabs cloned voice ID |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | ElevenLabs TTS model |
