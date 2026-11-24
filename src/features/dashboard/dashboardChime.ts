import type { Round } from '../../types/domain';

export type ChimeKind = 't-5' | 't-0';

export interface ChimeTrigger {
  key: string;
  roundNumber: number;
  kind: ChimeKind;
  scheduledStartAt: string;
}

/** T-5 minute lead time before a scheduled Round start. */
export const CHIME_LEAD_MS = 5 * 60 * 1000;

/** Active trigger window so 1s ticks catch each cue without firing stale chimes later. */
export const CHIME_TRIGGER_WINDOW_MS = 60 * 1000;

interface OscillatorNodeLike {
  type: OscillatorType;
  frequency: {
    setValueAtTime: (value: number, startTime: number) => void;
  };
  connect: (destination: unknown) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

interface GainNodeLike {
  gain: {
    setValueAtTime: (value: number, startTime: number) => void;
    linearRampToValueAtTime: (value: number, endTime: number) => void;
    exponentialRampToValueAtTime: (value: number, endTime: number) => void;
  };
  connect: (destination: unknown) => void;
}

export interface AudioContextLike {
  currentTime: number;
  state?: AudioContextState;
  destination: unknown;
  resume?: () => Promise<void>;
  createOscillator: () => OscillatorNodeLike;
  createGain: () => GainNodeLike;
}

let sharedAudioContext: AudioContextLike | null = null;

/**
 * Pure scheduler that evaluates which T-5 min and T-0 Round reminder chimes
 * should fire at `nowMs`, skipping already-started Rounds and already-fired keys.
 */
export function evaluateChimeTriggers(
  rounds: ReadonlyArray<Round>,
  nowMs: number,
  firedKeys: ReadonlySet<string>,
  windowMs: number = CHIME_TRIGGER_WINDOW_MS,
): ChimeTrigger[] {
  const triggers: ChimeTrigger[] = [];
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of sortedRounds) {
    if (round.startedAt !== null) {
      continue;
    }
    const scheduledMs = Date.parse(round.scheduledStartAt);
    if (Number.isNaN(scheduledMs)) {
      continue;
    }

    const t5AtMs = scheduledMs - CHIME_LEAD_MS;
    const t5Key = `${round.roundNumber}:t-5`;
    if (nowMs >= t5AtMs && nowMs < t5AtMs + windowMs && !firedKeys.has(t5Key)) {
      triggers.push({
        key: t5Key,
        roundNumber: round.roundNumber,
        kind: 't-5',
        scheduledStartAt: round.scheduledStartAt,
      });
    }

    const t0Key = `${round.roundNumber}:t-0`;
    if (nowMs >= scheduledMs && nowMs < scheduledMs + windowMs && !firedKeys.has(t0Key)) {
      triggers.push({
        key: t0Key,
        roundNumber: round.roundNumber,
        kind: 't-0',
        scheduledStartAt: round.scheduledStartAt,
      });
    }
  }

  return triggers;
}

/**
 * Lazily resolves or resumes a shared browser Web Audio `AudioContext`
 * (safe to call from the Chime toggle click handler).
 */
export function getOrCreateAudioContext(): AudioContextLike | null {
  if (sharedAudioContext) {
    if (sharedAudioContext.state === 'suspended' && typeof sharedAudioContext.resume === 'function') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const AudioCtxCtor =
    (window as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;

  if (typeof AudioCtxCtor !== 'function') {
    return null;
  }

  try {
    sharedAudioContext = new AudioCtxCtor();
    if (sharedAudioContext.state === 'suspended' && typeof sharedAudioContext.resume === 'function') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

interface BellNote {
  freqHz: number;
  offsetSec: number;
  durationSec: number;
  peakGain: number;
}

const T5_NOTES: ReadonlyArray<BellNote> = [
  { freqHz: 523.25, offsetSec: 0, durationSec: 0.9, peakGain: 0.14 }, // C5
  { freqHz: 659.25, offsetSec: 0.24, durationSec: 1.1, peakGain: 0.14 }, // E5
];

const T0_NOTES: ReadonlyArray<BellNote> = [
  { freqHz: 523.25, offsetSec: 0, durationSec: 0.85, peakGain: 0.16 }, // C5
  { freqHz: 659.25, offsetSec: 0.22, durationSec: 0.9, peakGain: 0.16 }, // E5
  { freqHz: 783.99, offsetSec: 0.44, durationSec: 1.3, peakGain: 0.18 }, // G5
];

/**
 * Plays a gentle synthesized sine + triangle harmonic bell chime.
 * Returns true if audio was scheduled, false if Web Audio is unavailable.
 */
export function playDashboardChime(
  kind: ChimeKind,
  audioContextOverride?: AudioContextLike | null,
): boolean {
  const ctx =
    audioContextOverride === undefined ? getOrCreateAudioContext() : audioContextOverride;

  if (!ctx) {
    return false;
  }

  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx.resume().catch(() => undefined);
    }

    const notes = kind === 't-0' ? T0_NOTES : T5_NOTES;
    const baseTime = ctx.currentTime;

    for (const note of notes) {
      const startTime = baseTime + note.offsetSec;
      const endTime = startTime + note.durationSec;

      // Fundamental sine wave
      const fundamentalOsc = ctx.createOscillator();
      const fundamentalGain = ctx.createGain();
      fundamentalOsc.type = 'sine';
      fundamentalOsc.frequency.setValueAtTime(note.freqHz, startTime);

      fundamentalGain.gain.setValueAtTime(0.0001, startTime);
      fundamentalGain.gain.linearRampToValueAtTime(note.peakGain, startTime + 0.03);
      fundamentalGain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      fundamentalOsc.connect(fundamentalGain);
      fundamentalGain.connect(ctx.destination);
      fundamentalOsc.start(startTime);
      fundamentalOsc.stop(endTime + 0.02);

      // Soft warm harmonic overtone (triangle wave at 2x frequency, low volume)
      const harmonicOsc = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      harmonicOsc.type = 'triangle';
      harmonicOsc.frequency.setValueAtTime(note.freqHz * 2, startTime);

      harmonicGain.gain.setValueAtTime(0.0001, startTime);
      harmonicGain.gain.linearRampToValueAtTime(note.peakGain * 0.28, startTime + 0.02);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.durationSec * 0.7);

      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(ctx.destination);
      harmonicOsc.start(startTime);
      harmonicOsc.stop(startTime + note.durationSec * 0.72);
    }

    return true;
  } catch {
    return false;
  }
}
