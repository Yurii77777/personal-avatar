export interface TranscriptEvent {
  transcript: string;
  isFinal: boolean;
}

export interface ProcessingEvent {
  question: string;
}

export interface AnswerEvent {
  sessionId: string;
  answer: string;
  sources: Array<{
    chunkId: string;
    documentId: string;
    similarity: number;
    preview: string;
  }>;
}

export interface AudioEvent {
  audioBase64: string;
  sampleRate: number;
}

export interface ErrorEvent {
  message: string;
}
