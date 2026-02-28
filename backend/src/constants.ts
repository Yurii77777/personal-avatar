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
