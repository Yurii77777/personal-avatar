/**
 * Full voice pipeline test: streams a WAV file through the Voice Gateway.
 * Flow: WAV file → PCM chunks → WebSocket → Deepgram STT → RAG + LLM → answer (+ TTS)
 *
 * Prerequisites:
 *   - Backend running (make dev or make up)
 *   - DEEPGRAM_API_KEY set in .env
 *   - Knowledge base has at least one document uploaded
 *   - 16kHz mono 16-bit WAV file with a spoken question
 *
 * Create test WAV:
 *   ffmpeg -i your-question.mp3 -ar 16000 -ac 1 -sample_fmt s16 question.wav
 *
 * Usage: node scripts/test-voice-full.mjs <path-to-16khz-mono-wav>
 */
import { io } from "socket.io-client";
import { readFileSync, writeFileSync } from "fs";

const WAV_FILE = process.argv[2];
if (!WAV_FILE) {
  console.log("Usage: node scripts/test-voice-full.mjs <path-to-16khz-mono-wav>");
  console.log("");
  console.log("Підготовка WAV:");
  console.log("  ffmpeg -i your-question.mp3 -ar 16000 -ac 1 -sample_fmt s16 question.wav");
  process.exit(1);
}

const wav = readFileSync(WAV_FILE);
const pcm = wav.subarray(44); // Skip WAV header (44 bytes)

console.log(`Файл: ${WAV_FILE}`);
console.log(`PCM розмір: ${pcm.length} байт (~${(pcm.length / 32000).toFixed(1)}с @ 16kHz)`);
console.log("");

const URL = process.env.VOICE_URL || "http://localhost:3000/voice";
const socket = io(URL, { transports: ["websocket"] });

let gotAnswer = false;

socket.on("connect", () => {
  console.log("✓ Підключено");
  socket.emit("start-session", {});
});

socket.on("session-started", () => {
  console.log("✓ Сесія STT розпочата");
  console.log("  Стрімимо аудіо...");

  // Stream PCM in chunks (simulate real-time microphone)
  const CHUNK_SIZE = 4096;
  let offset = 0;

  const interval = setInterval(() => {
    if (offset >= pcm.length) {
      clearInterval(interval);
      console.log("  ✓ Аудіо відправлено повністю");
      // Give Deepgram time to process utterance_end
      setTimeout(() => {
        if (!gotAnswer) {
          console.log("  Чекаємо на utterance_end від Deepgram...");
        }
      }, 3000);
      // Hard stop after 15s if no answer
      setTimeout(() => {
        if (!gotAnswer) {
          console.log("\n⚠ Не отримали відповідь. Можливі причини:");
          console.log("  - Deepgram не розпізнав мову (перевірте DEEPGRAM_LANGUAGE)");
          console.log("  - Аудіо файл тихий або порожній");
          console.log("  - Невірний формат (потрібен 16kHz mono 16-bit PCM)");
          socket.emit("stop-session");
          cleanup();
        }
      }, 15000);
      return;
    }

    const chunk = pcm.subarray(offset, offset + CHUNK_SIZE);
    socket.emit("audio-chunk", chunk);
    offset += CHUNK_SIZE;
  }, 128); // ~4096 bytes per 128ms ≈ real-time at 16kHz 16-bit
});

socket.on("transcript", (data) => {
  const tag = data.isFinal ? "  [FINAL]" : "  [interim]";
  console.log(`${tag} "${data.transcript}"`);
});

socket.on("processing", (data) => {
  console.log(`\n→ Повна фраза: "${data.question}"`);
  console.log("  Відправлено в RAG + LLM...");
});

socket.on("answer", (data) => {
  gotAnswer = true;
  console.log(`\n✓ Текстова відповідь:`);
  console.log(`  "${data.answer}"`);
  console.log(`  Session: ${data.sessionId}`);
  console.log(`  Джерела: ${data.sources.length} чанків`);
  data.sources.forEach((s, i) => {
    console.log(`    ${i + 1}. similarity=${s.similarity.toFixed(3)} — "${s.preview.slice(0, 80)}..."`);
  });
});

socket.on("audio", (data) => {
  const audioBuffer = Buffer.from(data.audioBase64, "base64");
  const sizeKb = Math.round(audioBuffer.length / 1024);
  console.log(`\n✓ TTS аудіо: ${sizeKb}KB WAV, ${data.sampleRate}Hz`);

  writeFileSync("tts-response.wav", audioBuffer);
  console.log("  Збережено: tts-response.wav");
  console.log("  Програти: afplay tts-response.wav (macOS)");

  cleanup();
});

socket.on("tts-error", (data) => {
  console.log(`\n⚠ TTS недоступний: ${data.message}`);
  console.log("  (Нормально якщо ElevenLabs не налаштований)");
  console.log("  Текстова відповідь вже отримана — graceful degradation працює!");
  cleanup();
});

socket.on("error", (data) => {
  console.log(`\n✗ Помилка: ${data.message}`);
});

socket.on("connect_error", (err) => {
  console.log(`✗ Помилка підключення: ${err.message}`);
  console.log("  Перевірте що backend запущений: make dev");
  process.exit(1);
});

function cleanup() {
  setTimeout(() => {
    socket.emit("stop-session");
    socket.disconnect();
    console.log("\n✓ Тест завершено");
    process.exit(0);
  }, 500);
}

// Global timeout
setTimeout(() => {
  console.log("\n✗ Глобальний таймаут (60с).");
  console.log("  Перевірте DEEPGRAM_API_KEY та з'єднання.");
  process.exit(1);
}, 60000);
