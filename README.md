# Personal AI Avatar

AI avatar that replaces you in Google Meet calls. It looks like you (deepfake), speaks with your cloned voice, and answers questions using LLM + your knowledge base (resume, experience, notes).

## Епізоди відео / Video Episodes

Кожен епізод відповідає окремій гілці. Переключись на потрібну гілку, щоб побачити код з відповідного епізоду:

| Епізод | Гілка | Що всередині |
|--------|-------|--------------|
| Епізод 1 — Foundation + Text Pipeline | `main` (коміт `352a66f`) | NestJS backend, RAG pipeline (upload → embed → retrieve → generate), multi-provider LLM (Gemini/Claude), PostgreSQL + pgvector, REST API, Swagger docs |
| Епізод 2 — Voice Pipeline | `feature/phase-2-voice-pipeline` | Real-time STT (Deepgram) + TTS (ElevenLabs voice cloning), WebSocket gateway (`/voice`), Svelte 5 web client з мікрофоном, pnpm monorepo |

```bash
# Епізод 1 — текстовий пайплайн
git checkout main

# Епізод 2 — голосовий пайплайн
git checkout feature/phase-2-voice-pipeline
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node 22 + pnpm
- A Gemini API key (free) **or** an Anthropic API key
- Deepgram API key (Phase 2+ — for STT)
- ElevenLabs API key + cloned voice ID (Phase 2+ — for TTS)

## Quick Start

### 1. Clone & configure

```bash
pnpm install
cp .env.example .env
```

Edit `.env` and set your API keys:

```env
# Use Gemini (free tier, default)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here

# Or use Anthropic
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-key-here

# Phase 2+ — voice pipeline
DEEPGRAM_API_KEY=your-deepgram-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-cloned-voice-id
```

### 2. Start

```bash
make up        # Start PostgreSQL + backend via Docker
make migrate   # Push schema to database
```

### 3. Verify

```bash
curl http://localhost:3000/api/v1/health
# → {"status":"ok"}
```

### 4. Upload a knowledge document

Upload your resume, bio, or any text file (PDF, DOCX, MD, TXT — 10 MB max):

```bash
curl -F "file=@./my-resume.pdf" http://localhost:3000/api/v1/knowledge/upload
```

### 5. Ask a question

```bash
curl -X POST http://localhost:3000/api/v1/sessions/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is your professional experience?"}'
```

The avatar answers in first person, grounded only in your uploaded documents.

### 6. Voice pipeline (Phase 2+)

```bash
make dev          # Backend in watch mode
make dev-client   # Svelte web client on port 5173
```

Open `http://localhost:5173`, click the mic button and talk — you'll get real-time transcription and voice answers.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/knowledge/upload` | Upload a document (multipart) |
| GET | `/api/v1/knowledge` | List uploaded documents |
| DELETE | `/api/v1/knowledge/:id` | Delete a document |
| POST | `/api/v1/sessions/ask` | Ask a question |
| WebSocket | `/voice` | Real-time voice pipeline (Phase 2+) |

Swagger docs: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Commands

```bash
make up            # Start everything (Docker)
make down          # Stop everything
make logs          # Tail container logs
make dev           # Backend in watch mode (requires local Node 22 + running DB)
make dev-client    # Svelte web client dev server (port 5173)
make migrate       # Push schema to database (drizzle-kit push)
make test          # Run unit tests
make test-e2e      # Run e2e tests
make build         # Build backend
make build-client  # Build web client
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` or `anthropic` |
| `GEMINI_API_KEY` | — | Required when provider is `gemini` |
| `ANTHROPIC_API_KEY` | — | Required when provider is `anthropic` |
| `DEEPGRAM_API_KEY` | — | Deepgram STT key (Phase 2+) |
| `ELEVENLABS_API_KEY` | — | ElevenLabs TTS key (Phase 2+) |
| `ELEVENLABS_VOICE_ID` | — | Cloned voice ID (Phase 2+) |
| `DATABASE_URL` | `postgresql://avatar:avatar@localhost:5432/avatar` | PostgreSQL connection |
| `PORT` | `3000` | Server port |

See `.env.example` for the full list with all optional variables.

## Roadmap

- [x] Phase 1 — Foundation + Text Pipeline (RAG, LLM, REST API)
- [x] Phase 2 — Voice Pipeline (STT, TTS, WebSocket, Web Client)
- [ ] Phase 3 — Avatar (MuseTalk lip sync, WebRTC streaming)
- [ ] Phase 4 — Google Meet Integration (OBS + Virtual Audio Cable)
- [ ] Phase 5 — Production + SaaS (auth, multi-tenant, deployment)
