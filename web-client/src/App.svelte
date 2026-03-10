<script lang="ts">
  import { onMount } from 'svelte';
  import { VoiceClient } from './lib/voice-client';
  import type { TranscriptEvent, ProcessingEvent, AnswerEvent, AudioEvent, ErrorEvent } from './lib/voice-client';
  import { AudioRecorder } from './lib/audio-recorder';

  const STOP_DELAY_MS = 1500;
  const ERROR_DISPLAY_MS = 8000;

  let status = $state('Disconnected');
  let statusClass = $state('');
  let btnDisabled = $state(true);
  let talking = $state(false);

  let transcriptHtml = $state('');
  let answerText = $state('');
  let sourcesText = $state('');

  let errorMessage = $state('');
  let errorVisible = $state(false);
  let errorTimer: ReturnType<typeof setTimeout> | undefined;

  let audioUrl = $state<string | null>(null);
  let audioEl: HTMLAudioElement | undefined = $state(undefined);

  let client: VoiceClient;
  let recorder: AudioRecorder;

  function setStatus(text: string, type: 'default' | 'connected' | 'error' = 'default') {
    status = text;
    statusClass = type !== 'default' ? type : '';
  }

  function showError(message: string) {
    errorMessage = message;
    errorVisible = true;
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { errorVisible = false; }, ERROR_DISPLAY_MS);
  }

  function playAudio(base64: string) {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/wav' });

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
  }

  $effect(() => {
    if (audioUrl && audioEl) {
      audioEl.play().catch(() => {});
    }
  });

  async function startTalking() {
    if (talking) return;
    talking = true;

    transcriptHtml = '';
    answerText = '';
    sourcesText = '';

    client.startSession();

    try {
      await recorder.start((chunk) => {
        client.sendAudio(chunk);
      });
    } catch (err: any) {
      showError(`Mic: ${err.message}`);
      talking = false;
    }
  }

  function stopTalking() {
    if (!talking) return;
    talking = false;

    recorder.stop();
    setTimeout(() => { client.stopSession(); }, STOP_DELAY_MS);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.code === 'Space' && !e.repeat && e.target === document.body) {
      e.preventDefault();
      startTalking();
    }
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      stopTalking();
    }
  }

  onMount(() => {
    recorder = new AudioRecorder();
    client = new VoiceClient({
      onConnect() {
        setStatus('Connected', 'connected');
        btnDisabled = false;
      },
      onDisconnect() {
        setStatus('Disconnected');
        btnDisabled = true;
        if (talking) stopTalking();
      },
      onSessionStarted() {},
      onTranscript(data: TranscriptEvent) {
        if (data.isFinal) {
          transcriptHtml = data.transcript;
        } else {
          transcriptHtml = `<span class="interim">${data.transcript}</span>`;
        }
      },
      onProcessing(data: ProcessingEvent) {
        setStatus(`Processing: "${data.question}"`, 'connected');
      },
      onAnswer(data: AnswerEvent) {
        answerText = data.answer;
        if (data.sources.length > 0) {
          sourcesText = `${data.sources.length} source(s) — top similarity: ${data.sources[0].similarity.toFixed(3)}`;
        } else {
          sourcesText = '';
        }
        setStatus('Connected', 'connected');
      },
      onAudio(data: AudioEvent) {
        playAudio(data.audioBase64);
      },
      onTtsError(data: ErrorEvent) {
        showError(`TTS: ${data.message}`);
      },
      onError(data: ErrorEvent) {
        showError(data.message);
        setStatus('Connected', 'connected');
      },
    });

    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keyup', onKeyup);

    return () => {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('keyup', onKeyup);
    };
  });
</script>

<div id="app">
  <h1>AI Avatar</h1>
  <p class="status {statusClass}">{status}</p>

  <button
    class="talk-btn"
    class:active={talking}
    disabled={btnDisabled}
    onmousedown={(e) => { e.preventDefault(); startTalking(); }}
    onmouseup={() => stopTalking()}
    onmouseleave={() => { if (talking) stopTalking(); }}
    ontouchstart={(e) => { e.preventDefault(); startTalking(); }}
    ontouchend={(e) => { e.preventDefault(); stopTalking(); }}
  >
    {talking ? 'Listening...' : 'Hold to Talk'}
  </button>
  <p class="hint">Hold button, Space, or touch to talk</p>

  <div class="box">
    <h2>Transcript</h2>
    <p class="transcript">{@html transcriptHtml}</p>
  </div>

  <div class="box">
    <h2>Answer</h2>
    <p class="answer">{answerText}</p>
    {#if sourcesText}
      <div class="sources">{sourcesText}</div>
    {/if}
  </div>

  {#if audioUrl}
    <div class="box">
      <h2>Audio Response</h2>
      <audio bind:this={audioEl} controls src={audioUrl}></audio>
    </div>
  {/if}

  {#if errorVisible}
    <div class="box error-box">
      <p>{errorMessage}</p>
    </div>
  {/if}
</div>

<style>
  #app {
    max-width: 600px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .status {
    text-align: center;
    font-size: 0.85rem;
    color: #888;
  }

  .status.connected {
    color: #4ade80;
  }

  .status.error {
    color: #f87171;
  }

  .talk-btn {
    align-self: center;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    border: 3px solid #333;
    background: #1a1a1a;
    color: #ccc;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .talk-btn:hover:not(:disabled) {
    border-color: #555;
    background: #222;
  }

  .talk-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .talk-btn.active {
    border-color: #ef4444;
    background: #2a1010;
    color: #f87171;
    box-shadow: 0 0 30px rgba(239, 68, 68, 0.2);
  }

  .hint {
    text-align: center;
    font-size: 0.75rem;
    color: #555;
  }

  .box {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 1rem;
  }

  .transcript {
    font-size: 0.95rem;
    line-height: 1.5;
    min-height: 1.5em;
  }

  .transcript :global(.interim) {
    color: #888;
    font-style: italic;
  }

  .answer {
    font-size: 0.95rem;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .sources {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #666;
  }

  audio {
    width: 100%;
    margin-top: 0.25rem;
  }

  .error-box {
    border-color: #7f1d1d;
    background: #1a0f0f;
  }

  .error-box p {
    color: #f87171;
    font-size: 0.85rem;
  }
</style>
