import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsProvider, TtsSynthesisResult } from './tts-provider.interface';
import { ElevenLabsTtsProvider } from './elevenlabs-tts.provider';
import { TTS_MAX_TEXT_LENGTH } from '../constants';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly provider: TtsProvider;

  constructor(private readonly config: ConfigService) {
    this.provider = new ElevenLabsTtsProvider(
      this.config.get<string>('elevenlabs.apiKey')!,
      this.config.get<string>('elevenlabs.voiceId')!,
      this.config.get<string>('elevenlabs.model')!,
    );
    this.logger.log('TTS service initialized (ElevenLabs provider)');
  }

  async synthesize(text: string): Promise<TtsSynthesisResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('TTS text cannot be empty');
    }

    const truncated = text.length > TTS_MAX_TEXT_LENGTH
      ? text.slice(0, TTS_MAX_TEXT_LENGTH)
      : text;

    if (truncated.length < text.length) {
      this.logger.warn(`Text truncated from ${text.length} to ${TTS_MAX_TEXT_LENGTH} chars`);
    }

    this.logger.debug(`Synthesizing ${truncated.length} chars`);
    return this.provider.synthesize(truncated);
  }
}
