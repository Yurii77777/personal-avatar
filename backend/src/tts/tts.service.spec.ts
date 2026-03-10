import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TtsService } from './tts.service';
import { TTS_MAX_TEXT_LENGTH } from '../constants';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('TtsService', () => {
  let service: TtsService;

  beforeEach(async () => {
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TtsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                'elevenlabs.apiKey': 'test-elevenlabs-key',
                'elevenlabs.voiceId': 'test-voice-id',
                'elevenlabs.model': 'eleven_multilingual_v2',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TtsService>(TtsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should synthesize text successfully', async () => {
    const fakeAudio = Buffer.from('fake-pcm-audio');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer.slice(fakeAudio.byteOffset, fakeAudio.byteOffset + fakeAudio.byteLength),
    });

    const result = await service.synthesize('Hello world');

    expect(result.audioBuffer).toEqual(fakeAudio);
    expect(result.sampleRate).toBe(24000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('test-voice-id');
    expect(url).toContain('pcm_24000');
    expect(opts.headers['xi-api-key']).toBe('test-elevenlabs-key');
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('Hello world');
    expect(body.model_id).toBe('eleven_multilingual_v2');
  });

  it('should throw on empty text', async () => {
    await expect(service.synthesize('')).rejects.toThrow('TTS text cannot be empty');
    await expect(service.synthesize('   ')).rejects.toThrow('TTS text cannot be empty');
  });

  it('should truncate text exceeding max length', async () => {
    const longText = 'a'.repeat(TTS_MAX_TEXT_LENGTH + 500);
    const fakeAudio = Buffer.from('audio');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer.slice(fakeAudio.byteOffset, fakeAudio.byteOffset + fakeAudio.byteLength),
    });

    await service.synthesize(longText);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text.length).toBe(TTS_MAX_TEXT_LENGTH);
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(service.synthesize('Hello')).rejects.toThrow('status 401');
  });
});
