import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type {
  TranscriptEvent,
  ProcessingEvent,
  AnswerEvent,
  AudioEvent,
  ErrorEvent,
} from '@avatar/shared';
import { SttService, LiveSession } from './stt.service';
import { SessionService } from '../session/session.service';
import { TtsService } from '../tts/tts.service';
import { AudioService } from '../audio/audio.service';

interface ClientState {
  liveSession: LiveSession;
  sessionId: string | null;
  finalTranscripts: string[];
  lastInterim: string;
}

@WebSocketGateway({ namespace: '/voice', cors: { origin: '*' } })
export class SttGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SttGateway.name);
  private readonly clients = new Map<string, ClientState>();

  constructor(
    private readonly sttService: SttService,
    private readonly sessionService: SessionService,
    private readonly ttsService: TtsService,
    private readonly audioService: AudioService,
  ) {}

  handleDisconnect(client: Socket) {
    this.cleanup(client.id);
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('start-session')
  handleStartSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId?: string } | undefined,
  ) {
    if (this.clients.has(client.id)) {
      client.emit('error', { message: 'Session already active' } satisfies ErrorEvent);
      return;
    }

    const liveSession = this.sttService.createLiveSession(
      (result: TranscriptEvent) => {
        client.emit('transcript', result satisfies TranscriptEvent);
        const state = this.clients.get(client.id);
        if (!state) return;
        if (result.isFinal && result.transcript.trim().length > 0) {
          state.finalTranscripts.push(result.transcript);
          state.lastInterim = '';
          this.logger.debug(`Final transcript: "${result.transcript}"`);
        } else {
          state.lastInterim = result.transcript;
        }
      },
      () => this.handleUtteranceEnd(client),
      (error: Error) => {
        client.emit('error', { message: error.message } satisfies ErrorEvent);
      },
    );

    this.clients.set(client.id, {
      liveSession,
      sessionId: data?.sessionId ?? null,
      finalTranscripts: [],
      lastInterim: '',
    });

    client.emit('session-started');
    this.logger.debug(`Session started for client: ${client.id}`);
  }

  @SubscribeMessage('audio-chunk')
  handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() chunk: Buffer,
  ) {
    const state = this.clients.get(client.id);
    if (!state) {
      client.emit('error', { message: 'No active session. Send start-session first.' } satisfies ErrorEvent);
      return;
    }
    state.liveSession.sendAudio(chunk);
  }

  @SubscribeMessage('stop-session')
  async handleStopSession(@ConnectedSocket() client: Socket) {
    const state = this.clients.get(client.id);
    if (state) {
      // Use interim transcript as fallback if no finals arrived yet
      if (state.finalTranscripts.length === 0 && state.lastInterim.trim().length > 0) {
        this.logger.debug(`Using interim as fallback: "${state.lastInterim}"`);
        state.finalTranscripts.push(state.lastInterim);
      }
      if (state.finalTranscripts.length > 0) {
        this.logger.debug(`Processing ${state.finalTranscripts.length} transcript(s) on stop`);
        await this.handleUtteranceEnd(client);
      }
    }
    this.cleanup(client.id);
    this.logger.debug(`Session stopped for client: ${client.id}`);
  }

  private async handleUtteranceEnd(client: Socket) {
    const state = this.clients.get(client.id);
    if (!state) return;

    const question = state.finalTranscripts.join(' ').trim();
    state.finalTranscripts = [];

    if (question.length === 0) return;

    client.emit('processing', { question } satisfies ProcessingEvent);

    try {
      const result = await this.sessionService.ask(question, state.sessionId ?? undefined);

      if (!state.sessionId) {
        state.sessionId = result.sessionId;
      }

      client.emit('answer', {
        sessionId: result.sessionId,
        answer: result.answer,
        sources: result.sources,
      } satisfies AnswerEvent);

      // TTS — fire after text answer is already delivered
      try {
        const { audioBuffer, sampleRate } = await this.ttsService.synthesize(result.answer);
        const wav = this.audioService.isWav(audioBuffer)
          ? audioBuffer
          : this.audioService.pcmToWav(audioBuffer, { sampleRate });

        client.emit('audio', {
          audioBase64: this.audioService.bufferToBase64(wav),
          sampleRate,
        } satisfies AudioEvent);
      } catch (ttsError: any) {
        this.logger.error(`TTS failed: ${ttsError.message}`);
        client.emit('tts-error', { message: ttsError.message } satisfies ErrorEvent);
      }
    } catch (error: any) {
      this.logger.error(`Ask failed: ${error.message}`);
      client.emit('error', { message: error.message } satisfies ErrorEvent);
    }
  }

  private cleanup(clientId: string) {
    const state = this.clients.get(clientId);
    if (state) {
      state.liveSession.close();
      this.clients.delete(clientId);
    }
  }
}
