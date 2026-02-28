# Personal AI Avatar

RAG-powered AI avatar that answers questions grounded in your uploaded knowledge base (resume, docs, notes). Speaks in first person as if it _is_ you.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A Gemini API key (free) **or** an Anthropic API key

## Quick start

### 1. Clone & configure

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```env
# Use Gemini (free tier, default)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here

# Or use Anthropic
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-key-here
```

### 2. Start

```bash
make up
```

This builds the backend and starts PostgreSQL (with pgvector) + the NestJS server.

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

### 6. Continue a conversation

Pass the `sessionId` from the previous response to maintain context:

```bash
curl -X POST http://localhost:3000/api/v1/sessions/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Tell me more about that", "sessionId": "<id-from-previous-response>"}'
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/knowledge/upload` | Upload a document (multipart) |
| GET | `/api/v1/knowledge` | List uploaded documents |
| DELETE | `/api/v1/knowledge/:id` | Delete a document |
| POST | `/api/v1/sessions/ask` | Ask a question |

Swagger docs available at [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## Commands

```bash
make up          # Start everything (Docker)
make down        # Stop everything
make logs        # Tail container logs
make dev         # Run backend in watch mode (requires local Node 22 + running DB)
make migrate     # Push schema to database (drizzle-kit push)
make test        # Run unit tests
make test-e2e    # Run e2e tests
make build       # Build backend
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` or `anthropic` |
| `GEMINI_API_KEY` | — | Required when provider is `gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model ID |
| `ANTHROPIC_API_KEY` | — | Required when provider is `anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20241022` | Anthropic model ID |
| `DATABASE_URL` | `postgresql://avatar:avatar@localhost:5432/avatar` | PostgreSQL connection |
| `PORT` | `3000` | Server port |
