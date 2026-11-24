import type { RsvpStatus } from '../../types/domain';

export interface RsvpOption {
  value: RsvpStatus;
  label: string;
  shortLabel: string;
  description: string;
}

export const RSVP_OPTIONS: ReadonlyArray<RsvpOption> = [
  {
    value: 'going_runner',
    label: 'Going (Runner)',
    shortLabel: 'Runner',
    description: 'Running one or more 5K Legs with a Team',
  },
  {
    value: 'going_supporter',
    label: 'Going (Supporter)',
    shortLabel: 'Supporter',
    description: 'Cheering, helping, and hanging out at Basecamp',
  },
  {
    value: 'maybe',
    label: 'Maybe',
    shortLabel: 'Maybe',
    description: 'Still deciding — keeping options open',
  },
  {
    value: 'cant_make_it',
    label: "Can't make it",
    shortLabel: "Can't make it",
    description: 'Cheering from afar this year',
  },
];

export const ROUND_NUMBERS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function getRsvpOption(status: RsvpStatus): RsvpOption {
  return RSVP_OPTIONS.find((opt) => opt.value === status) ?? RSVP_OPTIONS[0];
}

export interface ParticipantProfileDraft {
  displayName: string;
  rsvpStatus: RsvpStatus;
  availableFromRound: number;
  availableToRound: number;
  rough5kMinutesInput: string;
  isFirst5k: boolean;
  dietaryNotes: string;
  showTimesOnLeaderboard: boolean;
}

export interface ValidatedParticipantProfile {
  displayName: string;
  rsvpStatus: RsvpStatus;
  availableFromRound: number;
  availableToRound: number;
  rough5kMinutes: number | null;
  isFirst5k: boolean;
  dietaryNotes: string | null;
  showTimesOnLeaderboard: boolean;
}

export function validateParticipantProfile(
  draft: ParticipantProfileDraft,
): { ok: true; value: ValidatedParticipantProfile } | { ok: false; error: string } {
  const trimmedName = draft.displayName.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Please enter your name.' };
  }

  const from = Number(draft.availableFromRound);
  const to = Number(draft.availableToRound);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    from > 10 ||
    to < 1 ||
    to > 10
  ) {
    return { ok: false, error: 'Round availability must be between Round 1 and Round 10.' };
  }

  if (from > to) {
    return {
      ok: false,
      error: 'Start Round must be on or before End Round (Rounds 1–10).',
    };
  }

  const trimmedPace = draft.rough5kMinutesInput.trim();
  let rough5kMinutes: number | null = null;
  if (trimmedPace.length > 0) {
    if (!/^\d+$/.test(trimmedPace)) {
      return {
        ok: false,
        error: 'Rough 5K pace must be a whole number of minutes (for example, 28).',
      };
    }
    const parsed = Number.parseInt(trimmedPace, 10);
    if (parsed < 10 || parsed > 120) {
      return {
        ok: false,
        error: 'Rough 5K pace should be between 10 and 120 minutes.',
      };
    }
    rough5kMinutes = parsed;
  }

  const trimmedDietary = draft.dietaryNotes.trim();

  return {
    ok: true,
    value: {
      displayName: trimmedName,
      rsvpStatus: draft.rsvpStatus,
      availableFromRound: from,
      availableToRound: to,
      rough5kMinutes,
      isFirst5k: draft.isFirst5k,
      dietaryNotes: trimmedDietary.length > 0 ? trimmedDietary : null,
      showTimesOnLeaderboard: draft.showTimesOnLeaderboard,
    },
  };
}
