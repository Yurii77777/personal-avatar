import { AudioService, WavInfo } from './audio.service';
import { WAV_HEADER_SIZE, WAV_DEFAULT_SAMPLE_RATE } from '../constants';

describe('AudioService', () => {
  let service: AudioService;

  beforeEach(() => {
    service = new AudioService();
  });

  describe('pcmToWav / wavToPcm roundtrip', () => {
    it('should produce a valid WAV and roundtrip back to original PCM', () => {
      const pcm = Buffer.alloc(1600, 0x42); // 1600 bytes of PCM data
      const wav = service.pcmToWav(pcm, { sampleRate: 16000 });

      expect(service.isWav(wav)).toBe(true);
      expect(wav.length).toBe(WAV_HEADER_SIZE + pcm.length);

      const roundtripped = service.wavToPcm(wav);
      expect(roundtripped).toEqual(pcm);
    });

    it('should use default sample rate when none provided', () => {
      const pcm = Buffer.alloc(100);
      const wav = service.pcmToWav(pcm);
      const info = service.getWavInfo(wav);

      expect(info.sampleRate).toBe(WAV_DEFAULT_SAMPLE_RATE);
      expect(info.channels).toBe(1);
      expect(info.bitsPerSample).toBe(16);
    });

    it('should respect custom options', () => {
      const pcm = Buffer.alloc(200);
      const wav = service.pcmToWav(pcm, { sampleRate: 44100, channels: 2, bitsPerSample: 16 });
      const info = service.getWavInfo(wav);

      expect(info.sampleRate).toBe(44100);
      expect(info.channels).toBe(2);
    });
  });

  describe('isWav', () => {
    it('should return false for buffers smaller than header size', () => {
      expect(service.isWav(Buffer.alloc(10))).toBe(false);
    });

    it('should return false for non-WAV data', () => {
      expect(service.isWav(Buffer.alloc(100, 0x00))).toBe(false);
    });

    it('should return true for valid WAV', () => {
      const wav = service.pcmToWav(Buffer.alloc(100));
      expect(service.isWav(wav)).toBe(true);
    });
  });

  describe('wavToPcm', () => {
    it('should throw for invalid WAV input', () => {
      expect(() => service.wavToPcm(Buffer.alloc(10))).toThrow('Invalid WAV file');
    });
  });

  describe('getWavInfo', () => {
    it('should throw for invalid WAV input', () => {
      expect(() => service.getWavInfo(Buffer.alloc(10))).toThrow('Invalid WAV file');
    });

    it('should return correct metadata', () => {
      const sampleRate = 16000;
      const pcm = Buffer.alloc(32000); // 1 second at 16kHz mono 16-bit
      const wav = service.pcmToWav(pcm, { sampleRate });
      const info: WavInfo = service.getWavInfo(wav);

      expect(info.sampleRate).toBe(sampleRate);
      expect(info.channels).toBe(1);
      expect(info.bitsPerSample).toBe(16);
      expect(info.dataSize).toBe(32000);
      expect(info.durationMs).toBe(1000);
    });
  });

  describe('base64 conversion', () => {
    it('should roundtrip buffer through base64', () => {
      const original = Buffer.from('hello world');
      const base64 = service.bufferToBase64(original);
      const back = service.base64ToBuffer(base64);

      expect(back).toEqual(original);
    });
  });
});
