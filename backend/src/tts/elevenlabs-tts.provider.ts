import { TtsProvider, TtsSynthesisResult } from './tts-provider.interface';
import { TTS_TIMEOUT_MS } from '../constants';

const ELEVENLABS_TTS_SAMPLE_RATE = 24000;

export class ElevenLabsTtsProvider implements TtsProvider {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly model: string;

  constructor(apiKey: string, voiceId: string, model: string) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.model = model;
  }

  async synthesize(text: string): Promise<TtsSynthesisResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_24000`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: this.model,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs TTS request failed with status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      return {
        audioBuffer: Buffer.from(arrayBuffer),
        sampleRate: ELEVENLABS_TTS_SAMPLE_RATE,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
