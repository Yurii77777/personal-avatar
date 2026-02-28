# Personal AI Avatar — Product Requirements Document

## 1. Огляд продукту

### 1.1 Проблема

Співбесіди, мітинги та дзвінки забирають значний час. Людина не завжди може бути присутньою або хоче делегувати рутинні розмови. Існуючі рішення (HeyGen, D-ID) коштують $99-330/міс і не дають контролю над даними.

### 1.2 Рішення

Система, де реалістичний AI аватар замінює користувача у Google Meet дзвінках. Аватар:
- **Виглядає** як користувач (deepfake з фото/відео)
- **Говорить** клонованим голосом користувача
- **Відповідає** на питання через LLM + база знань (резюме, досвід, нотатки)
- **Працює** автономно від початку до кінця дзвінка

Співрозмовник бачить **одного учасника** — аватар подається як камера та мікрофон користувача через OBS Virtual Camera + Virtual Audio Cable. Клієнтська частина — **Web App у браузері** (друга вкладка), кросплатформна з коробки.

### 1.3 Цільова аудиторія

**v1**: Особисте використання (1 аватар — власний)
**v2+**: SaaS — будь-хто може створити свого аватара та базу знань

### 1.4 Мови

Англійська + Українська (STT обидві, TTS — англійська у v1, українська з v2)

---

## 2. Архітектура системи

### 2.1 Високорівнева схема

```
┌─────────────────────────────────────────────────────────┐
│                    Google Meet (вкладка 1)                │
│           Співрозмовник бачить 1 учасника (тебе)         │
└────────────┬──────────────────────────┬──────────────────┘
             │                          ▲
             │ OBS захоплює вікно       │ OBS Virtual Camera
             │ Web App як камеру        │ + Virtual Audio Cable
             │                          │
┌────────────┴──────────────────────────┴──────────────────┐
│                    Web App (вкладка 2)                     │
│                    Браузер користувача                     │
│                                                            │
│  getDisplayMedia() ──→ WebSocket ──→ Server (audio)       │
│  <canvas> avatar  ←── WebRTC    ←── Server (video)        │
│  <audio> output   ←── WebRTC    ←── Server (audio)        │
│                                                            │
│  OBS Window Capture → захоплює <canvas> → Virtual Camera  │
│  Audio Output → Virtual Audio Cable → Meet мікрофон        │
└────────────┬──────────────────────────┬──────────────────┘
             │ audio stream             ▲ video + audio
             │ (WebSocket)              │ (WebRTC)
             ▼                          │
┌────────────────────────────────────────────────────────┐
│           Session Orchestrator (NestJS)                  │
│              DigitalOcean Droplet $24-48/mo              │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │   STT    │  │  LLM +    │  │  RAG (pgvector)      │  │
│  │ Deepgram │─▶│  Claude   │◀─│ резюме, досвід,      │  │
│  │ streaming│  │  Haiku    │  │ відповіді на питання  │  │
│  └──────────┘  └─────┬─────┘  └──────────────────────┘  │
│                      │ text response                     │
│                      ▼                                   │
│              ┌───────────────┐                           │
│              │  TTS Client   │──── RunPod Serverless ──┐ │
│              └───────────────┘                         │ │
│              ┌───────────────┐                         │ │
│              │ Avatar Client │──── RunPod Serverless ──┘ │
│              └───────────────┘                           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Чотири шари інфраструктури

| Шар | Що працює | Вартість | Коли активний |
|-----|-----------|----------|---------------|
| **Local** (браузер користувача) | Web App (вкладка), OBS Virtual Camera, Virtual Audio Cable | Безкоштовно | Під час дзвінка |
| **Always-on** (DO Droplet) | NestJS, PostgreSQL (+ pgvector), API, Web App static files | $24-48/міс | 24/7 |
| **On-demand GPU** (RunPod Serverless) | TTS (Chatterbox), Avatar (MuseTalk) | ~$0.40/год | Тільки під час дзвінка |
| **External APIs** | Deepgram STT, Claude LLM | Pay-per-use | Тільки під час дзвінка |

### 2.3 Потік даних у реальному часі

```
Співрозмовник говорить у Google Meet (вкладка 1)
        │
        ▼ System Audio (BlackHole/PulseAudio/VB-Cable)
   ┌──────────┐
   │ Web App  │ navigator.mediaDevices.getDisplayMedia({ audio: true })
   │(вкладка 2)│ Захоплює system audio → відправляє на сервер
   └────┬─────┘
        │ raw audio (WebSocket)
        ▼
   ┌─────────┐
   │ Deepgram │ STT streaming, ~100ms латентність
   │ Nova-3   │ підтримує EN + UK
   └────┬─────┘
        │ partial transcripts
        ▼
   ┌──────────┐
   │ VAD +    │ Voice Activity Detection
   │ Turn     │ Визначає коли співрозмовник закінчив говорити
   │ Detection│
   └────┬─────┘
        │ повне питання (текст)
        ▼
   ┌──────────┐     ┌──────────┐
   │ pgvector   │────▶│ Claude   │ System prompt + RAG контекст + питання
   │ RAG      │     │ Haiku    │ Streaming response, ~300ms до першого токена
   └──────────┘     └────┬─────┘
                         │ text chunks (streaming)
                         ▼
                    ┌──────────┐
                    │Chatterbox│ TTS з клонованим голосом
                    │ RunPod   │ ~200ms до першого аудіо чанка
                    └────┬─────┘
                         │ audio chunks
                         ▼
                    ┌──────────┐
                    │ MuseTalk │ Lip-sync: аудіо + фото → відео
                    │ RunPod   │ 30+ FPS, ~100ms
                    └────┬─────┘
                         │ video frames + audio
                         ▼ (WebRTC)
                    ┌──────────┐
                    │ Web App  │ Рендерить avatar на <canvas>
                    │(вкладка 2)│ Відтворює audio через <audio>
                    └────┬─────┘
                         │
                    ┌────┴─────┐
                    │          │
                    ▼          ▼
              OBS Window    Virtual Audio
              Capture →     Cable →
              Virtual       Meet
              Camera →      (мікрофон)
              Meet
              (камера)
                    │          │
                    ▼          ▼
              Співрозмовник бачить
              і чує аватара як одного учасника
```

### 2.4 Бюджет латентності

```
Компонент                    Латентність    Примітка
──────────────────────────────────────────────────────
getDisplayMedia() capture    ~30ms          browser API
Deepgram STT (streaming)     ~100ms         partial results
Turn Detection               ~200ms         чекає паузу
Claude Haiku (first token)   ~300ms         streaming
Chatterbox TTS (first chunk) ~200ms         streaming
MuseTalk (lip sync)          ~100ms         pipeline, 30fps
WebRTC transport             ~100ms         server → browser
──────────────────────────────────────────────────────
TOTAL до першого слова       ~1.03 сек      прийнятно
```

**Мітигація затримки:**
- Filler-фрази ("Let me think...", "Good question...") генеруються миттєво поки LLM думає
- TTS починає синтез до завершення повної відповіді LLM (streaming)
- Avatar idle animation (кивання, моргання) поки немає мовлення

---

## 3. Tech Stack

### 3.1 Чому TypeScript (Node.js) — єдиний стек

Весь проєкт на **TypeScript**: backend (NestJS) + web client (React або Vanilla TS). Переваги:
- **Один стек** — без контекст-свічингу між мовами
- **Нативний WebSocket/WebRTC** — Node.js створений для real-time streaming
- **Web App = кросплатформна з коробки** — працює у будь-якому браузері, нічого встановлювати
- **Browser APIs** — `getDisplayMedia()` для system audio, `<canvas>` для рендерингу, WebRTC для стрімінгу
- **Зрілі SDK** — Deepgram, Anthropic, RunPod мають офіційні Node.js SDK

### 3.2 Обґрунтування вибору кожного компоненту

#### Backend: NestJS
- **Чому**: Модульна архітектура, вбудований WebSocket Gateway, DI-контейнер, serve static для Web App
- **Альтернативи відхилені**: Express (немає структури), Fastify (менш зрілий DI), FastAPI/Python (два стеки замість одного)

#### Web Client: React або Vanilla TS
- **Чому**: Кросплатформний з коробки (Chrome, Firefox, Safari), не потрібно нічого встановлювати, Browser APIs для audio/video
- **Альтернативи відхилені**: Electron (потрібно встановлювати окремий додаток, зайва складність)
- **Ключові Browser APIs**: `getDisplayMedia()` (system audio capture), `RTCPeerConnection` (WebRTC), `<canvas>` (video render), `AudioContext` (audio processing)

#### STT: Deepgram Nova-3
- **Чому**: $200 безкоштовних кредитів (~433 години), streaming з ~100ms, нативна підтримка української, офіційний Node.js SDK
- **Альтернативи відхилені**: Whisper (вища латентність ~300ms, потребує GPU для real-time), Google STT (дорожче)
- **Після free tier**: $0.0077/хв = $0.46/год

#### LLM: Claude Haiku 4.5
- **Чому**: Найкращий баланс ціна/якість ($1/$5 per MTok), достатньо розумний для діалогу, швидкий, офіційний @anthropic-ai/sdk
- **Альтернативи відхилені**: GPT-4o-mini (порівнянна ціна, але Claude краще слідує інструкціям), Llama 3 local (потребує GPU 24/7)
- **Оптимізація**: Prompt caching для system prompt (-90% вартості repeated tokens)

#### TTS: Chatterbox (Resemble AI)
- **Чому**: MIT ліцензія, open-source, faster-than-realtime, voice clone з кількох секунд аудіо, self-hosted
- **Альтернативи відхилені**: ElevenLabs (платний API $5-11/міс), XTTS-v2 (вища латентність ~500ms), CosyVoice 2 (складніший setup)
- **Ризик**: Підтримка української не підтверджена — потрібна валідація. Fallback: XTTS-v2 fine-tuned на українських датасетах

#### Avatar: MuseTalk 1.5
- **Чому**: MIT ліцензія, 30+ FPS на GPU, найкращий lip-sync серед open-source, training code відкритий
- **Альтернативи відхилені**: Wav2Lip (нижча якість), Deep-Live-Cam (потребує веб-камеру як драйвер), HeyGen API ($99/міс)
- **Вимоги**: GPU з 6GB+ VRAM (RunPod T4)

#### ORM: Drizzle + pgvector
- **Чому**: Найшвидший ORM для Node.js, SQL-like синтаксис, відмінна підтримка pgvector, легкий, type-safe
- **Альтернативи відхилені**: TypeORM (баговатий, повільний розвиток), Prisma (важчий, schema.prisma замість TS)
- **pgvector**: Розширення PostgreSQL для векторного пошуку — RAG працює в тій самій БД, без окремого сервісу (на відміну від Qdrant/ChromaDB)

#### Local Streaming: OBS Window Capture + Virtual Audio Cable
- **Чому**: Безкоштовно, співрозмовник бачить 1 учасника (не бота), повний контроль
- **Як працює**: OBS захоплює вікно Web App (canvas з аватаром) → Virtual Camera → Google Meet. Audio output Web App → Virtual Audio Cable → Google Meet мікрофон
- **Per-OS setup**: BlackHole (Mac), PulseAudio (Linux), VB-Cable (Windows)

#### GPU Compute: RunPod Serverless
- **Чому**: Pay-per-second (не платиш коли не використовуєш), від $0.17/год, підтримує custom Docker images
- **Альтернативи відхилені**: DigitalOcean GPU ($547/міс always-on — занадто дорого), Modal.com (порівнянна ціна, менш гнучкий)
- **Стратегія**: Два workers — TTS та Avatar, активні тільки під час сесії

### 3.3 Повний стек

| Шар | Технологія | Ліцензія | Вартість |
|-----|-----------|----------|----------|
| Web Client | React / Vanilla TS (Browser) | MIT | Безкоштовно |
| Virtual Camera | OBS Studio (Window Capture) | GPLv2 | Безкоштовно |
| Virtual Audio | BlackHole / PulseAudio / VB-Cable | Open Source | Безкоштовно |
| Backend | Node.js 22 + NestJS 11 | MIT | Безкоштовно |
| ORM | Drizzle ORM | Apache 2.0 | Безкоштовно |
| Database | PostgreSQL 17 + pgvector | PostgreSQL | Безкоштовно (self-hosted) |
| STT | Deepgram Nova-3 | Proprietary API | $200 free, потім $0.46/год |
| LLM | Claude Haiku 4.5 | Proprietary API | $1/$5 per MTok |
| TTS | Chatterbox | MIT | Безкоштовно (self-hosted GPU) |
| Lip Sync | MuseTalk 1.5 | MIT | Безкоштовно (self-hosted GPU) |
| GPU | RunPod Serverless | N/A | ~$0.40/год |
| Hosting | DigitalOcean Droplet | N/A | $24-48/міс |
| Embeddings | @xenova/transformers (all-MiniLM-L6-v2) | Apache 2.0 | Безкоштовно (CPU) |
| Containers | Docker + Compose | Apache 2.0 | Безкоштовно |

---

## 4. Фази реалізації

### Фаза 1: Foundation + Text Pipeline (тижні 1-2)

**Ціль**: Користувач завантажує базу знань, задає питання через API — отримує інтелектуальну відповідь з RAG контекстом.

**Що будується:**
- NestJS backend skeleton (config, health, API versioning)
- PostgreSQL з Drizzle міграціями (sessions, users, knowledge)
- pgvector розширення для векторного пошуку (RAG)
- Knowledge base ingestion (PDF, DOCX, Markdown парсер)
- Claude Haiku LLM service з system prompt engineering
- RAG pipeline: query → embed → retrieve → augment prompt → generate
- Базовий тест-сьют (Jest)

**Ключові файли:**

```
backend/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts                        # NestJS bootstrap
│   ├── app.module.ts                  # Root module
│   ├── config/
│   │   └── configuration.ts           # ConfigModule settings
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema (всі таблиці)
│   │   └── migrations/                # Drizzle auto-generated migrations
│   ├── knowledge/
│   │   ├── knowledge.module.ts
│   │   ├── knowledge.controller.ts    # CRUD knowledge base
│   │   ├── knowledge.service.ts       # Doc parsing + embedding
│   │   └── dto/
│   │       ├── upload-knowledge.dto.ts
│   │       └── knowledge-response.dto.ts
│   ├── rag/
│   │   ├── rag.module.ts
│   │   ├── rag.service.ts             # pgvector retrieval
│   │   └── embedding.service.ts       # @xenova/transformers embeddings
│   ├── llm/
│   │   ├── llm.module.ts
│   │   └── llm.service.ts             # Claude API + prompt mgmt
│   ├── session/
│   │   ├── session.module.ts
│   │   └── session.controller.ts      # POST /ask
│   └── health/
│       └── health.controller.ts       # Health check
├── drizzle.config.ts                  # Drizzle Kit config
├── test/
│   ├── app.e2e-spec.ts
│   └── llm.service.spec.ts
```

**Acceptance criteria:**
1. `POST /api/v1/knowledge/upload` приймає PDF/DOCX/MD та індексує в pgvector
2. `POST /api/v1/sessions/ask` з питанням повертає контекстну відповідь через RAG
3. Якість відповіді перевірена на вмісті резюме
4. `docker-compose up` запускає повний стек локально
5. Час відповіді < 2с для генерації тексту

**Вартість фази:** $0 (локальна розробка, Claude free tier для тестів)

---

### Фаза 2: Voice Pipeline — STT + TTS (тижні 3-4)

**Ціль**: Аудіо на вхід → транскрипт → AI відповідь → аудіо на вихід (клонованим голосом).

**Що будується:**
- Deepgram streaming STT інтеграція (WebSocket)
- Chatterbox TTS worker на RunPod Serverless
- Voice clone setup: запис 10-30с голосу → speaker embedding
- Утиліти конвертації аудіо (PCM/WAV/OGG)
- End-to-end voice pipeline тест (audio file in → audio file out)

**Ключові файли:**

```
backend/src/
├── stt/
│   ├── stt.module.ts
│   ├── stt.service.ts                 # Deepgram streaming client
│   └── stt.gateway.ts                 # WebSocket gateway для аудіо
├── tts/
│   ├── tts.module.ts
│   └── tts.service.ts                 # RunPod TTS worker caller
└── audio/
    ├── audio.module.ts
    └── audio.service.ts               # Audio format conversion

gpu-workers/tts-worker/
├── Dockerfile                         # GPU Docker image з Chatterbox
├── handler.py                         # RunPod handler: text → audio (Python)
└── requirements.txt

scripts/
└── setup-voice-clone.sh               # Voice sample preparation
```

> **Примітка**: GPU workers (tts-worker, avatar-worker) залишаються на Python — це inference scripts що запускаються на RunPod. RunPod serverless workers використовують Python runtime. Вся бізнес-логіка та оркестрація — TypeScript/NestJS.

**Acceptance criteria:**
1. Deepgram транскрибує English аудіо стрім з < 200ms латентністю
2. Chatterbox генерує мовлення клонованим голосом з тексту
3. End-to-end латентність (audio in → audio out) < 2.5 секунди
4. Схожість голосу > 70% (суб'єктивна оцінка)
5. RunPod cold start < 15 секунд, warm inference < 500ms

**Вартість фази:** ~$5-10 (RunPod тестування)

---

### Фаза 3: Avatar — Lip Sync + Visual (тижні 5-7)

**Ціль**: Генерація реалістичного відео обличчя користувача, що говорить AI-згенерованим аудіо.

**Що будується:**
- MuseTalk 1.5 avatar rendering worker на RunPod Serverless
- Face data preparation pipeline (обробка reference фото/відео)
- Avatar video streaming (WebRTC server → browser)
- Web Client прототип: `<canvas>` рендер avatar фреймів + `<audio>` playback
- Об'єднаний pipeline: audio → MuseTalk → video frames → Web Client

**Ключові файли:**

```
gpu-workers/avatar-worker/
├── Dockerfile                         # GPU Docker image з MuseTalk
├── handler.py                         # RunPod handler: audio + face → video (Python)
└── requirements.txt

backend/src/
├── avatar/
│   ├── avatar.module.ts
│   └── avatar.service.ts              # RunPod avatar worker caller
└── stream/
    ├── stream.module.ts
    └── stream.service.ts              # WebRTC streaming до browser

web-client/
├── package.json
├── tsconfig.json
├── vite.config.ts                     # Vite для dev + build
├── index.html
├── src/
│   ├── main.ts                        # Entry point
│   ├── services/
│   │   ├── webrtc-client.ts           # WebRTC receiver
│   │   ├── audio-capture.ts           # getDisplayMedia() system audio
│   │   ├── websocket-client.ts        # WebSocket для audio streaming
│   │   └── session-manager.ts         # Session control UI
│   ├── components/
│   │   ├── avatar-canvas.ts           # <canvas> avatar renderer
│   │   ├── session-controls.ts        # Start/stop/status UI
│   │   └── setup-guide.ts             # OBS + Virtual Audio setup guide
│   └── styles/
│       └── main.css
└── README.md

scripts/
└── setup-face-data.sh                 # Reference photo preprocessing
```

**Acceptance criteria:**
1. MuseTalk рендерить 25+ FPS lip-synced відео з аудіо + reference фото
2. Аватар впізнавано схожий на фото користувача
3. Lip sync точний та натуральний (суб'єктивна оцінка)
4. Відео фрейми стрімляться до Web Client `<canvas>` з < 200ms затримкою
5. RunPod avatar worker обробляє повне речення за < 2 секунди

**Вартість фази:** ~$15-25 (RunPod GPU тестування)

---

### Фаза 4: Google Meet Integration + Full Pipeline (тижні 8-10)

**Ціль**: Аватар працює у реальному Google Meet дзвінку — співрозмовник бачить і чує аватара як єдиного учасника.

**Що будується:**
- Web Client з повною інтеграцією:
  - `getDisplayMedia({ audio: true })`: захоплення system audio (голос співрозмовника з Meet)
  - OBS Window Capture: захоплює `<canvas>` з Web App → Virtual Camera → Meet камера
  - Virtual Audio Cable: Web App audio output → Meet мікрофон
- Session orchestrator (координує всі сервіси для live сесії)
- Повний real-time pipeline: Meet audio → STT → LLM+RAG → TTS → Avatar → Meet
- Session management UI (start/stop/status у Web App)
- Error handling, reconnection, graceful degradation
- Idle animations (моргання, легкі рухи голови) між відповідями
- Вбудований Setup Guide у Web App з покроковими інструкціями per-OS:
  - **Mac**: BlackHole (virtual audio), OBS Window Capture → Virtual Camera
  - **Linux**: PulseAudio + v4l2loopback, OBS
  - **Windows**: VB-Cable + OBS Window Capture → Virtual Camera

**Ключові файли:**

```
backend/src/
├── orchestrator/
│   ├── orchestrator.module.ts
│   └── orchestrator.service.ts        # Session pipeline coordinator
└── session/
    └── session.controller.ts          # POST /start, /stop, GET /status

web-client/src/
├── services/
│   ├── audio-capture.ts               # getDisplayMedia() system audio
│   ├── websocket-client.ts            # Audio → server
│   ├── webrtc-client.ts               # Avatar video+audio ← server
│   └── session-manager.ts             # Session lifecycle
└── components/
    ├── avatar-canvas.ts               # Full-screen canvas для OBS capture
    ├── session-controls.ts            # Start/stop UI
    └── setup-guide.ts                 # Per-OS setup інструкції
```

**Acceptance criteria:**
1. Співрозмовник у Google Meet бачить тільки 1 учасника (аватара)
2. Avatar відео з `<canvas>` → OBS → Virtual Camera → Meet камера
3. Avatar аудіо → Virtual Audio Cable → Meet мікрофон
4. End-to-end латентність від питання до першого слова < 3 секунди
5. Сесія працює 60+ хвилин без збоїв
6. Graceful handling мережевих переривань

**Вартість per-interview (production):**

```
RunPod GPU TTS (~20 хв active):   $0.13
RunPod GPU Avatar (~20 хв active): $0.13
Deepgram STT (1 год):             $0.00 (free credits) → $0.46
Claude Haiku (1 год):             $0.03
DO Droplet (amortized):           $0.03
─────────────────────────────────────────
TOTAL з free credits:              ~$0.32/год
TOTAL без free credits:            ~$0.78/год
```

---

### Фаза 5: Production + SaaS Foundation (тижні 11-14)

**Ціль**: Деплой на DigitalOcean, multi-user підтримка, моніторинг, підготовка до SaaS.

**Що будується:**
- DigitalOcean deployment (Docker Compose на droplet)
- Nginx reverse proxy з SSL (Let's Encrypt)
- User authentication (JWT через @nestjs/jwt + @nestjs/passport)
- Multi-tenant data isolation (namespace per user в pgvector)
- Моніторинг (health dashboard)
- Українська мова TTS (валідація Chatterbox або fine-tune XTTS-v2)
- Interview preparation mode (тренувальне Q&A перед реальним мітингом)
- Cost tracking per session
- Knowledge base management UI у Web App
- Avatar + Voice clone setup UI у Web App

**Ключові файли:**

```
docker-compose.prod.yml                # Production deployment
backend/src/
├── auth/
│   ├── auth.module.ts                 # JWT + Passport
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   └── guards/
│       └── jwt-auth.guard.ts
└── user/
    ├── user.module.ts
    └── user.service.ts

web-client/src/
├── pages/
│   ├── dashboard.ts                   # Головна панель
│   ├── knowledge.ts                   # Управління базою знань
│   ├── avatar-setup.ts               # Налаштування аватара + голосу
│   └── session.ts                     # Запуск та моніторинг сесій

scripts/deploy.sh                      # Automated deployment
```

**Acceptance criteria:**
1. Система доступна по HTTPS з доменом
2. Витримує 5 одночасних сесій без деградації
3. Моніторинг показує health системи
4. Cost tracking точний з похибкою < 10%
5. Ukrainian STT працює (Deepgram native) + TTS fallback функціональний

**Місячна вартість (production):**
- DigitalOcean droplet: $24-48/міс (фіксовано)
- Per interview: ~$0.32-0.78/год (змінна)

---

## 5. Структура проєкту

```
personal-avatar/
├── docs/
│   └── PRD.md                          # Цей документ
│
├── backend/                             # NestJS orchestrator (always-on DO droplet)
│   ├── Dockerfile
│   ├── docker-compose.yml               # Dev: backend + postgres (pgvector)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── nest-cli.json
│   ├── src/
│   │   ├── main.ts                      # NestJS bootstrap
│   │   ├── app.module.ts                # Root module
│   │   ├── config/
│   │   │   └── configuration.ts         # ConfigModule (@nestjs/config)
│   │   ├── db/                          # Drizzle schema + migrations
│   │   │   ├── schema.ts               # Всі таблиці (users, sessions, knowledge)
│   │   │   └── migrations/             # Auto-generated migrations
│   │   ├── knowledge/                   # Knowledge base module
│   │   │   ├── knowledge.module.ts
│   │   │   ├── knowledge.controller.ts
│   │   │   ├── knowledge.service.ts
│   │   │   └── dto/
│   │   ├── rag/                         # RAG retrieval module
│   │   │   ├── rag.module.ts
│   │   │   ├── rag.service.ts           # pgvector retrieval
│   │   │   └── embedding.service.ts     # Local embeddings
│   │   ├── llm/                         # LLM module
│   │   │   ├── llm.module.ts
│   │   │   └── llm.service.ts           # Claude API + prompt mgmt
│   │   ├── stt/                         # Speech-to-Text module
│   │   │   ├── stt.module.ts
│   │   │   ├── stt.service.ts           # Deepgram streaming
│   │   │   └── stt.gateway.ts           # WebSocket gateway
│   │   ├── tts/                         # Text-to-Speech module
│   │   │   ├── tts.module.ts
│   │   │   └── tts.service.ts           # RunPod TTS caller
│   │   ├── avatar/                      # Avatar rendering module
│   │   │   ├── avatar.module.ts
│   │   │   └── avatar.service.ts        # RunPod Avatar caller
│   │   ├── stream/                      # WebRTC streaming module
│   │   │   ├── stream.module.ts
│   │   │   └── stream.service.ts        # WebRTC до browser
│   │   ├── orchestrator/                # Session orchestrator
│   │   │   ├── orchestrator.module.ts
│   │   │   └── orchestrator.service.ts  # Pipeline coordinator
│   │   ├── session/                     # Session management
│   │   │   ├── session.module.ts
│   │   │   └── session.controller.ts    # Start/stop/status
│   │   ├── auth/                        # Authentication (Фаза 5)
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── jwt.strategy.ts
│   │   ├── user/                        # User management (Фаза 5)
│   │   │   ├── user.module.ts
│   │   │   └── user.service.ts
│   │   ├── audio/                       # Audio utilities
│   │   │   └── audio.service.ts
│   │   └── health/
│   │       └── health.controller.ts
│   ├── drizzle.config.ts               # Drizzle Kit config
│   └── test/
│       ├── app.e2e-spec.ts
│       ├── llm.service.spec.ts
│       └── orchestrator.service.spec.ts
│
├── web-client/                          # Web App (browser-based, Vite + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.ts                      # Entry point
│   │   ├── services/
│   │   │   ├── webrtc-client.ts         # WebRTC receiver (avatar video+audio)
│   │   │   ├── audio-capture.ts         # getDisplayMedia() system audio
│   │   │   ├── websocket-client.ts      # Audio stream → server
│   │   │   └── session-manager.ts       # Session lifecycle control
│   │   ├── components/
│   │   │   ├── avatar-canvas.ts         # <canvas> avatar renderer
│   │   │   ├── session-controls.ts      # Start/stop/status UI
│   │   │   └── setup-guide.ts           # Per-OS OBS + Audio setup guide
│   │   ├── pages/                       # (Фаза 5)
│   │   │   ├── dashboard.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── avatar-setup.ts
│   │   │   └── session.ts
│   │   └── styles/
│   │       └── main.css
│   └── README.md
│
├── gpu-workers/                         # RunPod serverless workers (Python)
│   ├── tts-worker/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── handler.py                   # Chatterbox: text → audio
│   └── avatar-worker/
│       ├── Dockerfile
│       ├── requirements.txt
│       └── handler.py                   # MuseTalk: audio + face → video
│
├── scripts/
│   ├── setup-voice-clone.sh             # Підготовка voice sample
│   ├── setup-face-data.sh               # Підготовка face photo/video
│   └── deploy.sh                        # Deployment automation
│
├── docker-compose.yml                   # Local dev
├── docker-compose.prod.yml              # Production (DO droplet)
├── .env.example
├── .gitignore
├── Makefile
└── README.md
```

---

## 6. Аналіз витрат

### 6.1 Витрати на розробку (по фазах)

| Фаза | Інфраструктура | API витрати | Всього |
|------|---------------|-------------|--------|
| Фаза 1: Text Pipeline | $0 (локально) | $0 (Claude free) | **$0** |
| Фаза 2: Voice Pipeline | $0 | ~$5-10 (RunPod) | **~$10** |
| Фаза 3: Avatar | $0 | ~$15-25 (RunPod) | **~$25** |
| Фаза 4: Meet Integration | $0 | ~$5-10 (RunPod) | **~$10** |
| Фаза 5: Production | $24-48 (DO) | ~$10 (тестування) | **~$58** |
| **TOTAL** | | | **~$103** |

### 6.2 Вартість одного інтерв'ю (production)

```
Компонент                  Вартість/год    Примітка
──────────────────────────────────────────────────────
RunPod TTS (Chatterbox)    ~$0.13          ~20 хв active з 60
RunPod Avatar (MuseTalk)   ~$0.13          ~20 хв active з 60
Deepgram STT               $0.00-0.46     $200 free credits
Claude Haiku               $0.03          ~30K tokens/год
DO Droplet (amortized)     $0.03          $24/міс ÷ 720 год
──────────────────────────────────────────────────────
TOTAL з free credits       ~$0.32/год
TOTAL без free credits     ~$0.78/год
```

### 6.3 Місячні витрати (production, 20 інтерв'ю/міс)

```
Фіксовані:
  DigitalOcean Droplet (4GB RAM):    $24/міс

Змінні (20 інтерв'ю × 1 год):
  RunPod GPU:                        $5.20
  Deepgram:                          $0.00 (free credits)
  Claude Haiku:                      $0.60
──────────────────────────────────────────────
TOTAL:                               ~$30/міс (з free credits)
                                     ~$39/міс (без free credits)
```

---

## 7. Ризики та мітигація

| Ризик | Ймовірність | Вплив | Мітигація |
|-------|------------|-------|-----------|
| **Українська TTS недоступна** | ВИСОКА | Середній | Старт тільки EN. Валідувати Chatterbox Multilingual для UK. Fallback: fine-tune XTTS-v2 на [ukrainian-tts-datasets](https://github.com/egorsmkv/ukrainian-tts-datasets) |
| **RunPod cold start > 15с** | Середня | Високий | Pre-warm workers за 5 хв до запланованого мітингу. Використовувати RunPod FlashBoot. Тримати idle animation поки workers стартують |
| **getDisplayMedia() обмеження** | Середня | Високий | Chrome/Edge підтримують system audio capture. Safari має обмеження. Firefox — часткова підтримка. Рекомендувати Chrome. Fallback: Virtual Audio Cable loopback |
| **OBS Window Capture setup** | Середня | Середній | Складний для нетехнічних користувачів. Мітигація: вбудований setup guide у Web App з покроковими скріншотами. У v2: browser extension для автоматизації |
| **Lip sync "uncanny valley"** | Середня | Середній | Почати з static image + тільки lip движення. MuseTalk 1.5 значно покращений. A/B тест Wav2Lip як fallback |
| **Латентність > 3 секунди** | Середня | Високий | Pipeline parallelization (TTS починає до завершення LLM). Streaming TTS. Filler-фрази ("Let me think about that...") |
| **Якість голосу клону** | Середня | Високий | Записати якісний sample (тиша, хороший мікрофон). Тестувати різні TTS engines. 30с sample мінімум |
| **Вартість зростає при масштабуванні** | Середня | Середній | Cost tracking per session. Hard limits per user. Оптимізація prompts для зменшення tokens |
| **Етичні/юридичні ризики** | Низька | Високий | Тільки personal use scope. Watermarking. Explicit consent для кожної сесії. Disclosure що це AI avatar |

---

## 8. Roadmap

```
Тижні 1-2:   ████████░░░░░░░░░░░░░░░░░░░░  Фаза 1: Text Pipeline + RAG
Тижні 3-4:   ░░░░░░░░████████░░░░░░░░░░░░  Фаза 2: Voice Pipeline (STT+TTS)
Тижні 5-7:   ░░░░░░░░░░░░░░░░████████████  Фаза 3: Avatar (MuseTalk) + Web Client
Тижні 8-10:  ░░░░░░░░░░░░░░░░░░░░████████  Фаза 4: Google Meet (OBS pipeline)
Тижні 11-14: ░░░░░░░░░░░░░░░░░░░░░░░░████  Фаза 5: Production + SaaS
```

**Загалом: ~14 тижнів до production-ready MVP**

---

## 9. Open Questions

1. **Chatterbox Multilingual**: Чи справді підтримує українську? Потрібна експериментальна валідація
2. **MuseTalk 1.5**: Яка мінімальна GPU для 30fps? Чи достатньо RunPod T4 (16GB)?
3. **Voice clone якість**: Скільки секунд reference audio потрібно для прийнятної якості?
4. **Concurrent sessions**: Скільки RunPod workers потрібно для 5 одночасних сесій?
5. **WebRTC vs WebSocket**: Яка мінімальна пропускна здатність для стрімінгу avatar відео 720p@30fps?
6. **getDisplayMedia() cross-browser**: Наскільки стабільна підтримка system audio capture в Chrome/Firefox/Safari?

---

## 10. Джерела та посилання

- [NestJS Documentation](https://docs.nestjs.com/)
- [MuseTalk (Lip Sync)](https://github.com/TMElyralab/MuseTalk)
- [Chatterbox TTS](https://github.com/resemble-ai/chatterbox)
- [Deep-Live-Cam (Face Swap)](https://github.com/hacksider/Deep-Live-Cam)
- [Duix/HeyGem Avatar (Open Source)](https://github.com/duixcom/Duix-Avatar)
- [TalkingHead.js (3D Avatar)](https://github.com/met4citizen/TalkingHead)
- [LiveKit Agents Framework](https://github.com/livekit/agents)
- [Pipecat Voice AI Framework](https://github.com/pipecat-ai/pipecat)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [Drizzle ORM](https://orm.drizzle.team/)
- [RunPod Serverless](https://www.runpod.io/product/serverless)
- [Deepgram Node.js SDK](https://github.com/deepgram/deepgram-node-sdk)
- [Anthropic Node.js SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Deepgram STT](https://deepgram.com)
- [Ukrainian TTS Datasets](https://github.com/egorsmkv/ukrainian-tts-datasets)
- [MDN getDisplayMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [OBS Studio](https://obsproject.com/)
- [BlackHole Virtual Audio (Mac)](https://existential.audio/blackhole/)
- [VB-Cable (Windows)](https://vb-audio.com/Cable/)
