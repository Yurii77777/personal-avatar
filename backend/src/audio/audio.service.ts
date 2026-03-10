import { Injectable } from '@nestjs/common';
import { WAV_HEADER_SIZE, WAV_DEFAULT_SAMPLE_RATE } from '../constants';

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataSize: number;
  durationMs: number;
}

@Injectable()
export class AudioService {
  pcmToWav(
    pcm: Buffer,
    opts: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {},
  ): Buffer {
    const sampleRate = opts.sampleRate ?? WAV_DEFAULT_SAMPLE_RATE;
    const channels = opts.channels ?? 1;
    const bitsPerSample = opts.bitsPerSample ?? 16;

    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    const dataSize = pcm.length;
    const fileSize = WAV_HEADER_SIZE + dataSize - 8;

    const header = Buffer.alloc(WAV_HEADER_SIZE);
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcm]);
  }

  wavToPcm(wav: Buffer): Buffer {
    if (!this.isWav(wav)) {
      throw new Error('Invalid WAV file: missing RIFF/WAVE header');
    }
    return wav.subarray(WAV_HEADER_SIZE);
  }

  base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
  }

  bufferToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  isWav(buffer: Buffer): boolean {
    if (buffer.length < WAV_HEADER_SIZE) return false;
    const riff = buffer.subarray(0, 4).toString('ascii');
    const wave = buffer.subarray(8, 12).toString('ascii');
    return riff === 'RIFF' && wave === 'WAVE';
  }

  getWavInfo(buffer: Buffer): WavInfo {
    if (!this.isWav(buffer)) {
      throw new Error('Invalid WAV file: missing RIFF/WAVE header');
    }

    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    const dataSize = buffer.readUInt32LE(40);
    const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);

    return { sampleRate, channels, bitsPerSample, dataSize, durationMs };
  }
}
