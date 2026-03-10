export interface TtsSynthesisResult {
  audioBuffer: Buffer;
  sampleRate: number;
}

export interface TtsProvider {
  synthesize(text: string): Promise<TtsSynthesisResult>;
}
