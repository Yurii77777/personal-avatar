# Фаза 1: Foundation + Text Pipeline

## Що побудовано

Backend для AI-аватара з RAG-pipeline: завантажуєш базу знань (резюме, нотатки) — аватар відповідає на питання, спираючись на завантажений контент.

**Як працює pipeline:**
1. Завантаження файлу (PDF, DOCX, MD, TXT)
2. Парсинг тексту з документу
3. Розбиття на чанки (512 символів, 64 overlap)
4. Генерація embeddings (all-MiniLM-L6-v2, 384 виміри)
5. Збереження векторів у PostgreSQL + pgvector
6. При запитанні — cosine similarity пошук релевантних чанків
7. LLM генерує відповідь від першої особи на основі знайденого контексту

**Стек:** NestJS 11, TypeScript, PostgreSQL 17 + pgvector, Drizzle ORM, HuggingFace Transformers, Gemini / Anthropic LLM.

### API

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/api/v1/health` | Перевірка стану сервера |
| POST | `/api/v1/knowledge/upload` | Завантаження файлу (до 10MB) |
| GET | `/api/v1/knowledge` | Список завантажених документів |
| DELETE | `/api/v1/knowledge/:id` | Видалення документа з каскадним видаленням чанків |
| POST | `/api/v1/sessions/ask` | Запитання з RAG-контекстом |

---

## Що потрібно перед стартом

- Docker та Docker Compose
- Gemini API ключ (безкоштовний) у файлі `.env` (`GEMINI_API_KEY=...`)
- Тестовий файл для завантаження (наприклад, PDF з резюме)

---

## Сценарій демо

### Крок 1 — Запуск стеку

Піднімаємо два контейнери: PostgreSQL з pgvector та NestJS backend.

```bash
make up
```

Перевіряємо логи — чекаємо на `Nest application successfully started`:

```bash
make logs
```

`Ctrl+C` щоб вийти з логів.

### Крок 2 — Синхронізація схеми БД

Створюємо таблиці в базі (users, knowledge_documents, knowledge_chunks з HNSW індексом, sessions, session_messages):

```bash
make migrate
```

Очікуваний результат: `Changes applied`

### Крок 3 — Health check

Перевіряємо що сервер відповідає:

```bash
curl http://localhost:3000/api/v1/health
```

Очікуваний результат:

```json
{ "status": "ok" }
```

### Крок 4 — Завантаження документа в базу знань

Завантажуємо PDF з резюме. Сервер автоматично парсить файл, розбиває текст на чанки, генерує embedding для кожного чанка та зберігає все в pgvector.

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/upload \
  -F "file=@path/to/your-cv.pdf"
```

Очікуваний результат:

```json
{
  "documentId": "cfbb2422-b52d-4718-938e-60a63a374b0a",
  "chunksCreated": 11
}
```

Зберігаємо `documentId` — знадобиться для видалення.

### Крок 5 — Перевірка списку документів

```bash
curl http://localhost:3000/api/v1/knowledge
```

Очікуваний результат: масив з завантаженим документом — `filename`, `chunksCount`, `createdAt`.

### Крок 6 — Запитання через RAG

Головний момент: задаємо питання і отримуємо відповідь, згенеровану на основі завантаженого резюме.

```bash
curl -X POST http://localhost:3000/api/v1/sessions/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is your work experience?"}'
```

Очікуваний результат: JSON з полями:
- `answer` — відповідь від першої особи на основі вмісту документа
- `sessionId` — ідентифікатор сесії для продовження розмови
- `sources` — масив знайдених чанків з їх similarity score

Зберігаємо `sessionId` для наступного кроку.

### Крок 7 — Follow-up питання (історія розмови)

Задаємо уточнююче питання в тій самій сесії. Аватар має враховувати контекст попередньої відповіді.

```bash
curl -X POST http://localhost:3000/api/v1/sessions/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Tell me more about the first role", "sessionId": "SESSION_ID"}'
```

Очікуваний результат: контекстна відповідь, яка посилається на попередню розмову. Це підтверджує що conversation history працює.

### Крок 8 — Видалення документа

Видаляємо документ — чанки видаляються каскадно.

```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/DOCUMENT_ID
```

Перевіряємо що база знань порожня:

```bash
curl http://localhost:3000/api/v1/knowledge
```

Очікуваний результат: `[]`

### Крок 9 — Перевірка що RAG більше не знаходить контекст

Після видалення документа аватар має коректно відповісти, що інформації немає.

```bash
curl -X POST http://localhost:3000/api/v1/sessions/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is your work experience?"}'
```

Очікуваний результат:

```json
{
  "answer": "I don't have that information in my knowledge base yet.",
  "sources": []
}
```

### Крок 10 — Swagger UI

Відкриваємо у браузері: **http://localhost:3000/api/docs**

Всі ендпоінти можна протестувати інтерактивно через Swagger інтерфейс.

### Крок 11 — Зупинка стеку

```bash
make down
```

---

## Критерії приймання

| # | Критерій | Як перевірити |
|---|----------|---------------|
| 1 | Upload PDF/DOCX/MD індексує в pgvector | Крок 4 — `chunksCreated > 0` |
| 2 | Ask повертає відповідь на основі RAG | Крок 6 — відповідь містить інформацію з документа |
| 3 | Якість перевірена на реальному резюме | Кроки 6-7 — точні відповіді про досвід та навички |
| 4 | `docker-compose up` піднімає повний стек | Крок 1 — обидва контейнери healthy |
| 5 | Час відповіді < 2с | Додати `time` перед curl у кроці 6 |
