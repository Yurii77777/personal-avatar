const SAMPLE_RATE = 16000;

export class AudioRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  async start(onChunk: (pcm: ArrayBuffer) => void): Promise<void> {
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });

    const processorUrl = new URL('./pcm-processor.ts', import.meta.url).href;
    await this.context.audioWorklet.addModule(processorUrl);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');

    this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      onChunk(e.data);
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.context.destination);
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}
