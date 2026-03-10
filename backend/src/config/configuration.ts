export default () => ({
  port: parseInt(process.env.PORT ?? "3000", 10),
  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://avatar:avatar@localhost:5432/avatar",
  },
  llm: {
    provider: process.env.LLM_PROVIDER || "gemini",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20241022",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY,
    model: process.env.DEEPGRAM_MODEL,
    language: process.env.DEEPGRAM_LANGUAGE,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL,
  },
});
