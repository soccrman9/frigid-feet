const STORAGE_KEY_PREFIX = 'wg50k_participant_';

function storageKeyForEvent(eventId: string): string {
  return `${STORAGE_KEY_PREFIX}${eventId}`;
}

export function getSavedParticipantId(eventId: string): string | null {
  if (!eventId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKeyForEvent(eventId));
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveParticipantId(eventId: string, participantId: string): void {
  if (!eventId || !participantId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyForEvent(eventId), participantId);
  } catch {
    // Ignore storage quota or private-browsing errors gracefully.
  }
}

export function clearSavedParticipantId(eventId: string): void {
  if (!eventId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKeyForEvent(eventId));
  } catch {
    // Ignore storage errors gracefully.
  }
}
