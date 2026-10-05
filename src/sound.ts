export type SoundCue =
  | 'deal' | 'play' | 'work' | 'gain' | 'retire' | 'discard' | 'burden'
  | 'tap' | 'confirm' | 'crisis' | 'end' | 'arrival' | 'launch' | 'cancel' | 'colony' | 'success';

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
  tap: [{ frequency: 850, end: 620, duration: 0.035, type: 'triangle' }],
  confirm: [
    { frequency: 440, duration: 0.055 },
    { frequency: 660, duration: 0.08, delay: 0.04 },
  ],
  crisis: [
    { frequency: 240, duration: 0.06, type: 'triangle' },
    { frequency: 360, duration: 0.12, delay: 0.06, type: 'triangle' },
  ],
  end: [
    { frequency: 390, duration: 0.08 },
    { frequency: 260, duration: 0.12, delay: 0.065 },
  ],
  arrival: [
    { frequency: 220, duration: 0.34 },
    { frequency: 330, duration: 0.3, delay: 0.07 },
    { frequency: 440, duration: 0.29, delay: 0.15 },
  ],
  launch: [
    { frequency: 160, end: 320, duration: 0.19, type: 'triangle' },
    { frequency: 480, duration: 0.14, delay: 0.13 },
  ],
  cancel: [{ frequency: 330, end: 220, duration: 0.07, type: 'triangle' }],
  colony: [
    { frequency: 190, duration: 0.04, type: 'triangle' },
    { frequency: 570, duration: 0.095, delay: 0.035 },
  ],
  success: [
    { frequency: 440, duration: 0.11 },
    { frequency: 550, duration: 0.15, delay: 0.065 },
    { frequency: 660, duration: 0.2, delay: 0.13 },
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
