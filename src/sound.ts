export type SoundCue = 'deal' | 'play' | 'work' | 'gain' | 'retire' | 'discard' | 'burden';

type Tone = { frequency: number; end?: number; delay?: number; duration: number; type?: OscillatorType };

const PREFERENCE_KEY = 'jovian-wake.sound';
const CUES: Record<SoundCue, Tone[]> = {
  deal: [{ frequency: 520, end: 380, duration: 0.045, type: 'triangle' }],
  play: [
    { frequency: 180, end: 120, duration: 0.045, type: 'triangle' },
    { frequency: 720, duration: 0.035, delay: 0.025 },
  ],
  work: [
    { frequency: 540, duration: 0.075 },
    { frequency: 810, duration: 0.1, delay: 0.05 },
  ],
  gain: [
    { frequency: 660, duration: 0.09 },
    { frequency: 990, duration: 0.13, delay: 0.055 },
  ],
  retire: [{ frequency: 280, end: 90, duration: 0.18, type: 'triangle' }],
  discard: [{ frequency: 220, end: 150, duration: 0.055, type: 'triangle' }],
  burden: [
    { frequency: 130, end: 100, duration: 0.11, type: 'triangle' },
    { frequency: 95, duration: 0.12, delay: 0.09, type: 'triangle' },
  ],
};

/** Presentation-only audio; no audio state or randomness reaches the voyage engine. */
export function createSoundController() {
  let enabled = true;
  try { enabled = globalThis.localStorage.getItem(PREFERENCE_KEY) !== 'off'; } catch { /* Storage may be blocked. */ }
  let context: AudioContext | null = null;
  let output: GainNode | null = null;
  let generation = 0;
  const voices = new Map<OscillatorNode, GainNode>();

  const silence = () => {
    generation += 1;
    for (const [oscillator, envelope] of voices) {
      try { oscillator.stop(); } catch { /* A completed voice can already be stopped. */ }
      oscillator.disconnect();
      envelope.disconnect();
    }
    voices.clear();
  };

  const prepare = (): AudioContext | null => {
    if (context && context.state !== 'closed') return context;
    const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Constructor = browser.AudioContext ?? browser.webkitAudioContext;
    if (!Constructor) return null;
    context = new Constructor();
    output = context.createGain();
    output.gain.value = 0.4;
    output.connect(context.destination);
    return context;
  };

  const schedule = (audio: AudioContext, cue: SoundCue, count: number, token: number) => {
    if (!enabled || token !== generation || audio !== context || audio.state !== 'running' || !output) return;
    const now = audio.currentTime + 0.012;
    for (let index = 0; index < count; index += 1) {
      for (const tone of CUES[cue]) {
        if (voices.size >= 12) return;
        const start = now + index * 0.065 + (tone.delay ?? 0);
        const finish = start + tone.duration;
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.type = tone.type ?? 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if (tone.end) oscillator.frequency.exponentialRampToValueAtTime(tone.end, finish);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(0.075 / Math.sqrt(count), start + 0.005);
        envelope.gain.exponentialRampToValueAtTime(0.0001, finish);
        oscillator.connect(envelope);
        envelope.connect(output);
        voices.set(oscillator, envelope);
        oscillator.onended = () => {
          voices.delete(oscillator);
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(finish + 0.005);
      }
    }
  };

  const play = (cue: SoundCue, count = 1) => {
    if (!enabled) return;
    const batch = Number.isFinite(count) ? Math.max(1, Math.min(3, Math.round(count))) : 1;
    const token = generation;
    try {
      const audio = prepare();
      if (!audio) return;
      if (audio.state === 'running') schedule(audio, cue, batch, token);
      else void audio.resume().then(() => schedule(audio, cue, batch, token)).catch(() => { /* Audio may be denied. */ });
    } catch { /* Audio failures must never interrupt a player action. */ }
  };

  return {
    enabled: () => enabled,
    toggle: () => {
      enabled = !enabled;
      silence();
      try { globalThis.localStorage.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off'); } catch { /* Keep the session preference. */ }
      return enabled;
    },
    play,
    silence,
  };
}
