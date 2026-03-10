/**
 * Quick WebSocket connection test for the Voice Gateway.
 * Verifies: connection, session creation, session lifecycle.
 * Does NOT require Deepgram key if you only want to check the gateway boots.
 *
 * Usage: node scripts/test-voice.mjs
 */
import { io } from "socket.io-client";

const URL = process.env.VOICE_URL || "http://localhost:3000/voice";

console.log(`Підключення до ${URL}...\n`);

const socket = io(URL, { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("✓ Підключено до /voice namespace");
  console.log("  Socket ID:", socket.id);
  console.log("");
  socket.emit("start-session", {});
});

socket.on("session-started", () => {
  console.log("✓ Сесія STT розпочата (Deepgram live connection створено)");
  console.log("");
  console.log("Готово до прийому аудіо-чанків.");
  console.log("(В реальному клієнті тут стрімиться мікрофон)");

  // Тест edge case: повторний start-session
  socket.emit("start-session", {});

  setTimeout(() => {
    console.log("\nЗакриваємо сесію...");
    socket.emit("stop-session");
    setTimeout(() => {
      socket.disconnect();
      console.log("✓ Відключено\n");
      console.log("Результат: WebSocket gateway працює коректно.");
      process.exit(0);
    }, 500);
  }, 3000);
});

socket.on("transcript", (data) => {
  const tag = data.isFinal ? "[FINAL]" : "[interim]";
  console.log(`  ${tag} "${data.transcript}"`);
});

socket.on("processing", (data) => {
  console.log(`\n→ Обробка: "${data.question}"`);
});

socket.on("answer", (data) => {
  console.log(`\n✓ Відповідь (session: ${data.sessionId}):`);
  console.log(`  "${data.answer}"`);
  if (data.sources.length > 0) {
    console.log(`  Джерела: ${data.sources.length} чанків`);
  }
});

socket.on("audio", (data) => {
  const sizeKb = Math.round((data.audioBase64.length * 3) / 4 / 1024);
  console.log(`\n✓ TTS аудіо: ~${sizeKb}KB, ${data.sampleRate}Hz`);
});

socket.on("tts-error", (data) => {
  console.log(`\n⚠ TTS помилка (graceful degradation): ${data.message}`);
});

socket.on("error", (data) => {
  console.log(`⚠ Помилка: ${data.message}`);
});

socket.on("connect_error", (err) => {
  console.log(`✗ Помилка підключення: ${err.message}`);
  console.log("  Перевірте що backend запущений: make dev");
  process.exit(1);
});

// Таймаут
setTimeout(() => {
  console.log("\n✗ Таймаут (15с).");
  process.exit(1);
}, 15000);
