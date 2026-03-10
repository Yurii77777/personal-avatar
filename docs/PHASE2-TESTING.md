# Фаза 2: Voice Pipeline — STT + TTS

## Що побудовано

Голосовий pipeline поверх існуючого текстового RAG: говориш питання в мікрофон → отримуєш текстову відповідь + аудіо-відповідь голосом клонованого аватара.

**Як працює pipeline:**
1. Web-client підключається до backend через WebSocket (`/voice`, Socket.IO)
2. Натискаєш "Hold to Talk" → мікрофон захоплює аудіо (PCM 16kHz mono через AudioWorklet)
3. Аудіо стрімиться чанками на сервер → Deepgram STT транскрибує в реальному часі
4. По завершенню фрази — транскрипт відправляється в RAG+LLM pipeline
5. Текстова відповідь негайно емітиться клієнту
6. Паралельно — ElevenLabs TTS генерує аудіо і емітить клієнту
7. Якщо TTS впав — текстова відповідь все одно є (graceful degradation)

**Стек:** Deepgram SDK (STT), Socket.IO (WebSocket), ElevenLabs API (TTS), Svelte 5 + Vite (web-client).

---

## Чому ElevenLabs замість RunPod + Chatterbox

Початковий план: self-hosted Chatterbox TTS на RunPod GPU. Реальність: over-engineering.

| | RunPod + Chatterbox (план) | ElevenLabs (реалізація) |
|---|---|---|
| **Інфраструктура** | Docker + Python worker + GPU | REST API |
| **Voice clone** | Самому готувати WAV | Клонуєш в UI за 30с |
| **Cold start** | 30-60с | Немає |
| **Код** | ~200 рядків Python + Dockerfile | 45 рядків TypeScript |
| **Вартість** | ~$490/міс (24/7 GPU) | $5-22/міс |

Strategy pattern залишився — нового провайдера можна додати без зміни решти коду.

---

## Системні вимоги

| Інструмент | Версія | Як встановити |
|------------|--------|---------------|
| **Node.js** | 22+ | `brew install node@22` |
| **pnpm** | 10+ | `npm install -g pnpm` |
| **Docker** + **Docker Compose** | 24+ | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Chrome** або **Edge** | latest | Потрібен AudioWorklet + getUserMedia |

---

## Що потрібно перед стартом

### API ключі

| Сервіс | Потрібен для | Безкоштовний tier | Як отримати |
|--------|-------------|-------------------|-------------|
| **Gemini** (або Anthropic) | LLM відповіді | Так | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Deepgram** | STT (голос → текст) | Так ($200 кредит) | [console.deepgram.com](https://console.deepgram.com/signup) → API Keys |
| **ElevenLabs** | TTS (текст → голос) | Так (10k символів/міс) | [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys |

**Мінімум:** Gemini + Deepgram — голосове питання + текстова відповідь.

**Повне демо:** + ElevenLabs — голосова відповідь клонованим голосом.

### Клонування голосу в ElevenLabs (опціонально)

1. https://elevenlabs.io → **Voices** → **Add a new voice** → **Instant Voice Clone**
2. Завантажити аудіо запис свого голосу (1-5 хвилин, чітка мова)
3. Скопіювати **Voice ID** з Settings голосу
4. Вставити в `.env` як `ELEVENLABS_VOICE_ID`

> Можна використати готовий голос з бібліотеки ElevenLabs.

---

## Демо (кроки 1-6)

### Крок 1 — Клонування та встановлення

```bash
git clone https://github.com/YOUR_USERNAME/personal-avatar.git
cd personal-avatar
pnpm install
cp .env.example .env
```

Заповнюємо `.env`:

```bash
DATABASE_URL=postgresql://avatar:avatar@localhost:5432/avatar
LLM_PROVIDER=gemini
GEMINI_API_KEY=ваш-ключ            # ← замінити
DEEPGRAM_API_KEY=ваш-ключ          # ← замінити
ELEVENLABS_API_KEY=ваш-ключ        # ← опціонально
ELEVENLABS_VOICE_ID=ваш-voice-id   # ← опціонально
```

### Крок 2 — Запуск стеку

```bash
make up
```

Чекаємо на старт:

```bash
make logs
```

Шукаємо в логах:

```
[NestApplication] Nest application successfully started
STT service initialized (model: nova-3, language: en)
TTS service initialized (ElevenLabs provider)
```

Перевірка:

```bash
curl http://localhost:3000/api/v1/health
# { "status": "ok" }
```

### Крок 3 — Підготовка бази знань

RAG потребує документи в базі:

```bash
# Варіант А: завантажити свій файл
curl -X POST http://localhost:3000/api/v1/knowledge/upload \
  -F "file=@path/to/your-document.pdf"

# Варіант Б: створити тестовий
echo "I am a software engineer with 5 years of experience in TypeScript, NestJS, and PostgreSQL." > test-bio.txt
curl -X POST http://localhost:3000/api/v1/knowledge/upload -F "file=@test-bio.txt"
```

Перевірити що документ в базі:

```bash
curl http://localhost:3000/api/v1/knowledge
```

### Крок 4 — Запуск web-client

В **окремому терміналі**:

```bash
make dev-client
```

Очікуваний результат:

```
  VITE v6.x.x  ready in XXms

  ➜  Local:   http://localhost:5173/
```

### Крок 5 — Тестування voice pipeline

Відкриваємо `http://localhost:5173` в Chrome.

**Step-by-step:**

1. Статус показує **"Connected"** (зеленим) — WebSocket до backend підключений
2. Натискаємо та **тримаємо** кнопку "Hold to Talk" (або **Space**)
3. Кнопка стає червоною — "Listening..."
4. Говоримо питання вголос (англійською, якщо `DEEPGRAM_LANGUAGE=en`)
5. В **Transcript** з'являється live-транскрипція:
   - Сірий курсив — interim (ще обробляється)
   - Звичайний текст — final (підтверджено)
6. **Відпускаємо** кнопку
7. Статус: `Processing: "your question"` — питання в RAG + LLM
8. В **Answer** — текстова відповідь + кількість джерел
9. В **Audio Response** — аудіо-програвач (якщо ElevenLabs налаштований)
10. Без ElevenLabs — червоне `TTS: ...`, але текстова відповідь є (graceful degradation)

**Session persistence:**

11. Натиснути "Hold to Talk" ще раз → задати follow-up питання
12. Відповідь враховує контекст попередньої розмови

**Очікувані результати:**

| Що | Без ElevenLabs | З ElevenLabs |
|---|---|---|
| Статус "Connected" | ✓ | ✓ |
| Кнопка стає червоною | ✓ | ✓ |
| Live-транскрипція | ✓ | ✓ |
| Текстова відповідь | ✓ | ✓ |
| Аудіо-програвач | ✗ (TTS error) | ✓ |
| Follow-up з контекстом | ✓ | ✓ |

### Крок 6 — Зупинка

```bash
make down
# Ctrl+C в терміналі web-client
```

---

## Критерії приймання

| # | Критерій | Як перевірити |
|---|----------|---------------|
| 1 | Unit тести проходять | `make test` — 25 passed |
| 2 | Web UI підключається до backend | Крок 5 — статус "Connected" |
| 3 | Мікрофон → live-транскрипція | Крок 5 — interim + final транскрипти |
| 4 | Повний pipeline: голос → RAG → відповідь | Крок 5 — текстова відповідь + джерела |
| 5 | TTS graceful degradation | Крок 5 без ElevenLabs — TTS error + текст є |
| 6 | ElevenLabs TTS генерує аудіо | Крок 5 з ключами — аудіо-програвач |
| 7 | Session persistence | Крок 5 — follow-up питання з контекстом |
| 8 | Текстовий REST API не зламаний | `curl -X POST .../sessions/ask -H "Content-Type: application/json" -d '{"question":"test"}'` |

---

## Troubleshooting

### Backend не стартує / `connection refused`

```bash
make logs        # перевірити логи
docker ps        # контейнери запущені?
make down && make up   # перезапустити
```

### Статус "Disconnected" в Web UI

1. `curl http://localhost:3000/api/v1/health` — backend живий?
2. DevTools (F12) → Console — помилки WebSocket?

### Мікрофон не працює / "Mic: NotAllowedError"

1. Відкрити через `http://localhost:5173` (не через IP)
2. Клікнути іконку замка в адресній строчці → дозволити мікрофон
3. "NotFoundError" — мікрофон не підключений

### Транскрипція не з'являється

1. `make logs` — помилки Deepgram?
2. `DEEPGRAM_API_KEY` валідний?
3. Мова аудіо відповідає `DEEPGRAM_LANGUAGE` (default: `en`)
4. Говорити голосніше — мікрофон ноутбука може бути тихим

### ElevenLabs 401

Невалідний `ELEVENLABS_API_KEY` або `ELEVENLABS_VOICE_ID`. Перевірити на elevenlabs.io. **Не критично** — текст все одно приходить.

### ElevenLabs 429 (rate limit)

Вичерпано 10k символів/міс. Текстові відповіді продовжують працювати.

### `vite: command not found`

```bash
pnpm install    # з кореня проекту
```

### `embedding model loading` зависає

Перший запуск завантажує модель (~23MB). Зачекати 30-60с.

### Docker: `port 5432 already in use`

```bash
lsof -i :5432
brew services stop postgresql    # macOS
```
