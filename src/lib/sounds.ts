/**
 * Sound effects, synthesised with the Web Audio API (PBI 15).
 *
 * No audio files: five short cues as .mp3 would add a few hundred KB, need
 * licence tracking and a loading state, and would still have to be decoded
 * before the first one could play. Oscillators cost nothing, start instantly
 * and carry no licence.
 *
 * Everything here is deliberately fail-soft. Audio is a garnish; a browser that
 * blocks it, an OS with no output device or a suspended context must never take
 * the game down with it.
 */

export type SoundName = 'correct' | 'wrong' | 'timeUp' | 'win' | 'lose' | 'tick' | 'reveal';

type Note = {
  /** Hz */
  freq: number;
  /** Seconds from the cue's start. */
  at: number;
  /** Seconds. */
  dur: number;
  type?: OscillatorType;
  /** Peak gain, 0–1, before the master volume. */
  gain?: number;
};

/**
 * Each cue is a handful of notes. The shapes matter more than the pitches:
 * rising for good, falling for bad, repeated for urgency.
 */
const CUES: Record<SoundName, Note[]> = {
  // Major third up, then the fifth — unambiguously "yes".
  correct: [
    { freq: 523.25, at: 0,    dur: 0.1,  type: 'triangle' },
    { freq: 659.25, at: 0.09, dur: 0.1,  type: 'triangle' },
    { freq: 783.99, at: 0.18, dur: 0.18, type: 'triangle' },
  ],
  // Falling tritone on a square wave — sour without being harsh.
  wrong: [
    { freq: 311.13, at: 0,    dur: 0.14, type: 'square', gain: 0.5 },
    { freq: 220.00, at: 0.12, dur: 0.22, type: 'square', gain: 0.5 },
  ],
  // Three flat beeps: the clock ran out, nobody did anything wrong.
  timeUp: [
    { freq: 440, at: 0,    dur: 0.09, type: 'sine' },
    { freq: 440, at: 0.16, dur: 0.09, type: 'sine' },
    { freq: 349.23, at: 0.32, dur: 0.22, type: 'sine' },
  ],
  // Short fanfare.
  win: [
    { freq: 523.25, at: 0,    dur: 0.12, type: 'triangle' },
    { freq: 659.25, at: 0.11, dur: 0.12, type: 'triangle' },
    { freq: 783.99, at: 0.22, dur: 0.12, type: 'triangle' },
    { freq: 1046.5, at: 0.33, dur: 0.34, type: 'triangle' },
    { freq: 783.99, at: 0.33, dur: 0.34, type: 'sine', gain: 0.3 },
  ],
  lose: [
    { freq: 392.00, at: 0,    dur: 0.16, type: 'triangle', gain: 0.45 },
    { freq: 329.63, at: 0.15, dur: 0.16, type: 'triangle', gain: 0.45 },
    { freq: 261.63, at: 0.30, dur: 0.38, type: 'triangle', gain: 0.45 },
  ],
  // Used for the last seconds of the timer — must be unobtrusive.
  tick: [{ freq: 880, at: 0, dur: 0.045, type: 'sine', gain: 0.22 }],
  // Neutral marker for "the answer is about to show".
  reveal: [{ freq: 587.33, at: 0, dur: 0.07, type: 'sine', gain: 0.3 }],
};

const MASTER_VOLUME = 0.22;

let ctx: AudioContext | null = null;

/**
 * Lazily creates the AudioContext. Browsers refuse to start one before a user
 * gesture, so this is called from the click/keypress path, never at import.
 */
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Contexts get suspended when a tab is backgrounded; resume is a no-op if running.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Plays a cue. Silently does nothing when audio is unavailable or muted.
 * @param name which cue
 * @param enabled the player's sound preference — passed in rather than read
 *        here so this module stays free of storage and React concerns
 */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const audio = getContext();
  if (!audio) return;

  const notes = CUES[name];
  if (!notes) return;

  try {
    const now = audio.currentTime;
    for (const note of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = note.type ?? 'sine';
      osc.frequency.value = note.freq;

      const peak = MASTER_VOLUME * (note.gain ?? 1);
      const start = now + note.at;
      const end = start + note.dur;

      // A short attack/release envelope: a bare oscillator gate clicks audibly.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.015, note.dur / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // A failed cue is not worth surfacing.
  }
}

/** Primes the context on a real user gesture so the first cue is not swallowed. */
export function warmUpAudio(): void {
  getContext();
}
