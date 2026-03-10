// RAG chunking
export const CHUNK_SIZE = 512;
export const CHUNK_OVERLAP = 64;

// Embedding
export const EMBEDDING_BATCH_SIZE = 32;
export const EMBEDDING_DIMENSIONS = 384;

// Database
export const INSERT_BATCH_SIZE = 100;

// Similarity search
export const SIMILARITY_TOP_K = 5;
export const SIMILARITY_THRESHOLD = 0.15;

// LLM
export const LLM_MAX_TOKENS = 1024;
export const EXTERNAL_API_TIMEOUT_MS = 30_000;

// Upload
export const UPLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Response formatting
export const PREVIEW_LENGTH = 200;

// STT (Deepgram)
export const DEEPGRAM_SAMPLE_RATE = 16000;
export const DEEPGRAM_ENCODING = 'linear16';
export const DEEPGRAM_ENDPOINTING_MS = 500;
export const DEEPGRAM_UTTERANCE_END_MS = 1000;

// TTS (ElevenLabs)
export const TTS_TIMEOUT_MS = 30_000;
export const TTS_MAX_TEXT_LENGTH = 2000;

// Audio (WAV)
export const WAV_HEADER_SIZE = 44;
export const WAV_DEFAULT_SAMPLE_RATE = 24000;
