/**
 * AudioWorklet processor: captures Float32 frames from mic,
 * converts to Int16 PCM, posts ArrayBuffer to main thread.
 *
 * Loaded via: audioContext.audioWorklet.addModule(url)
 * Must be self-contained — no imports allowed in worklet scope.
 */

// Ambient type declarations for AudioWorklet scope
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  ctor: typeof AudioWorkletProcessor,
): void;

declare const currentFrame: number;
declare const currentTime: number;
declare const sampleRate: number;

class PcmProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const float32 = input[0];
    const int16 = new Int16Array(float32.length);

    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s * 0x7fff;
    }

    const buffer = int16.buffer.slice(0);
    this.port.postMessage(buffer, [buffer]);

    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
