import { io, Socket } from 'socket.io-client';
import type {
  TranscriptEvent,
  ProcessingEvent,
  AnswerEvent,
  AudioEvent,
  ErrorEvent,
} from '@avatar/shared';

export type { TranscriptEvent, ProcessingEvent, AnswerEvent, AudioEvent, ErrorEvent };

const BACKEND_URL = 'http://localhost:3000';

export interface VoiceClientCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onSessionStarted: () => void;
  onTranscript: (data: TranscriptEvent) => void;
  onProcessing: (data: ProcessingEvent) => void;
  onAnswer: (data: AnswerEvent) => void;
  onAudio: (data: AudioEvent) => void;
  onTtsError: (data: ErrorEvent) => void;
  onError: (data: ErrorEvent) => void;
}

export class VoiceClient {
  private socket: Socket;
  private sessionId: string | null = null;

  constructor(callbacks: VoiceClientCallbacks) {
    this.socket = io(`${BACKEND_URL}/voice`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', callbacks.onConnect);
    this.socket.on('disconnect', callbacks.onDisconnect);
    this.socket.on('session-started', callbacks.onSessionStarted);
    this.socket.on('transcript', callbacks.onTranscript);
    this.socket.on('processing', callbacks.onProcessing);

    this.socket.on('answer', (data: AnswerEvent) => {
      this.sessionId = data.sessionId;
      callbacks.onAnswer(data);
    });

    this.socket.on('audio', callbacks.onAudio);
    this.socket.on('tts-error', callbacks.onTtsError);
    this.socket.on('error', callbacks.onError);
  }

  startSession(): void {
    const payload = this.sessionId ? { sessionId: this.sessionId } : undefined;
    this.socket.emit('start-session', payload);
  }

  sendAudio(chunk: ArrayBuffer): void {
    this.socket.emit('audio-chunk', chunk);
  }

  stopSession(): void {
    this.socket.emit('stop-session');
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
