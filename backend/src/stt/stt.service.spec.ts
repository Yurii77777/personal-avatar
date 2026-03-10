import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SttService } from './stt.service';

// Track all created mock connections
let mockConnections: any[] = [];

function createMockConnection() {
  const conn = {
    on: jest.fn(),
    send: jest.fn(),
    finish: jest.fn(),
  };
  mockConnections.push(conn);
  return conn;
}

jest.mock('@deepgram/sdk', () => ({
  createClient: jest.fn(() => ({
    listen: {
      live: jest.fn(() => createMockConnection()),
    },
  })),
  LiveTranscriptionEvents: {
    Open: 'open',
    Close: 'close',
    Error: 'error',
    Transcript: 'Results',
    Metadata: 'Metadata',
    UtteranceEnd: 'UtteranceEnd',
    SpeechStarted: 'SpeechStarted',
    Unhandled: 'Unhandled',
  },
}));

describe('SttService', () => {
  let service: SttService;

  beforeEach(async () => {
    mockConnections = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SttService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                'deepgram.apiKey': 'test-deepgram-key',
                'deepgram.model': 'nova-3',
                'deepgram.language': 'en',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SttService>(SttService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a live session and register event handlers', () => {
    const session = service.createLiveSession(jest.fn(), jest.fn(), jest.fn());
    const conn = mockConnections[0];

    expect(session).toHaveProperty('sendAudio');
    expect(session).toHaveProperty('close');
    // Should register 4 event handlers: Transcript, UtteranceEnd, Error, Close
    expect(conn.on).toHaveBeenCalledTimes(4);
  });

  it('should forward audio chunks via sendAudio', () => {
    const session = service.createLiveSession(jest.fn(), jest.fn(), jest.fn());
    const conn = mockConnections[0];
    const chunk = Buffer.from('audio-data');

    session.sendAudio(chunk);

    expect(conn.send).toHaveBeenCalledTimes(1);
    const arg = conn.send.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ArrayBuffer);
  });

  it('should call finish on close', () => {
    const session = service.createLiveSession(jest.fn(), jest.fn(), jest.fn());
    const conn = mockConnections[0];

    session.close();

    expect(conn.finish).toHaveBeenCalled();
  });

  it('should invoke transcript callback with non-empty transcripts', () => {
    const onTranscript = jest.fn();
    service.createLiveSession(onTranscript, jest.fn(), jest.fn());
    const conn = mockConnections[0];

    // Find the Transcript handler
    const transcriptCall = conn.on.mock.calls.find((c: any[]) => c[0] === 'Results');
    const transcriptHandler = transcriptCall[1];

    // Non-empty transcript
    transcriptHandler({
      channel: { alternatives: [{ transcript: 'hello world' }] },
      is_final: true,
    });
    expect(onTranscript).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: true });

    // Empty transcript (silence) — should NOT call onTranscript again
    onTranscript.mockClear();
    transcriptHandler({
      channel: { alternatives: [{ transcript: '' }] },
      is_final: false,
    });
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('should invoke utterance end callback', () => {
    const onUtteranceEnd = jest.fn();
    service.createLiveSession(jest.fn(), onUtteranceEnd, jest.fn());
    const conn = mockConnections[0];

    const utteranceCall = conn.on.mock.calls.find((c: any[]) => c[0] === 'UtteranceEnd');
    utteranceCall[1]();

    expect(onUtteranceEnd).toHaveBeenCalled();
  });

  it('should close all sessions on module destroy', () => {
    service.createLiveSession(jest.fn(), jest.fn(), jest.fn());
    service.createLiveSession(jest.fn(), jest.fn(), jest.fn());

    service.onModuleDestroy();

    // Each connection should have finish() called once
    expect(mockConnections).toHaveLength(2);
    expect(mockConnections[0].finish).toHaveBeenCalledTimes(1);
    expect(mockConnections[1].finish).toHaveBeenCalledTimes(1);
  });
});
