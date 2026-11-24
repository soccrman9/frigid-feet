import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSavedParticipantId,
  getSavedParticipantId,
  saveParticipantId,
} from './participantStorage';

describe('participantStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists, retrieves, and clears participant_id scoped per event_id', () => {
    expect(getSavedParticipantId('event-2027')).toBeNull();

    saveParticipantId('event-2027', 'participant-alex');
    saveParticipantId('event-2028', 'participant-sam');

    expect(getSavedParticipantId('event-2027')).toBe('participant-alex');
    expect(getSavedParticipantId('event-2028')).toBe('participant-sam');

    clearSavedParticipantId('event-2027');

    expect(getSavedParticipantId('event-2027')).toBeNull();
    expect(getSavedParticipantId('event-2028')).toBe('participant-sam');
  });
});
