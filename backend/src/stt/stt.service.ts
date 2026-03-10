import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  LiveTranscriptionEvents,
  ListenLiveClient,
} from '@deepgram/sdk';
import {
  DEEPGRAM_SAMPLE_RATE,
  DEEPGRAM_ENCODING,
  DEEPGRAM_ENDPOINTING_MS,
  DEEPGRAM_UTTERANCE_END_MS,
} from '../constants';

export interface LiveSession {
  sendAudio(chunk: Buffer): void;
  close(): void;
}

export interface TranscriptResult {
  transcript: string;
  isFinal: boolean;
}

@Injectable()
export class SttService implements OnModuleDestroy {
  private readonly logger = new Logger(SttService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly language: string;
  private readonly activeSessions = new Set<ListenLiveClient>();

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('deepgram.apiKey')!;
    this.model = this.config.get<string>('deepgram.model')!;
    this.language = this.config.get<string>('deepgram.language')!;
    this.logger.log(`STT service initialized (model: ${this.model}, language: ${this.language})`);
  }

  createLiveSession(
    onTranscript: (result: TranscriptResult) => void,
    onUtteranceEnd: () => void,
    onError: (error: Error) => void,
  ): LiveSession {
    const client = createClient(this.apiKey);

    const connection = client.listen.live({
      model: this.model,
      language: this.language,
      encoding: DEEPGRAM_ENCODING,
      sample_rate: DEEPGRAM_SAMPLE_RATE,
      channels: 1,
      punctuate: true,
      smart_format: true,
      endpointing: DEEPGRAM_ENDPOINTING_MS,
      utterance_end_ms: DEEPGRAM_UTTERANCE_END_MS,
      interim_results: true,
    });

    this.activeSessions.add(connection);

    connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript ?? '';
      if (transcript.length === 0) return;
      onTranscript({ transcript, isFinal: data.is_final ?? false });
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      onUtteranceEnd();
    });

    connection.on(LiveTranscriptionEvents.Error, (err: any) => {
      this.logger.error(`Deepgram error: ${err.message ?? err}`);
      onError(err instanceof Error ? err : new Error(String(err)));
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      this.activeSessions.delete(connection);
      this.logger.debug('Deepgram session closed');
    });

    return {
      sendAudio: (chunk: Buffer) => {
        connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
      },
      close: () => {
        this.activeSessions.delete(connection);
        connection.finish();
      },
    };
  }

  onModuleDestroy() {
    this.logger.log(`Closing ${this.activeSessions.size} active Deepgram sessions`);
    for (const session of this.activeSessions) {
      session.finish();
    }
    this.activeSessions.clear();
  }
}
