const MAX_URL_LENGTH = 500;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

/**
 * Validates that a URL is a safe `https://` URL within the 500-character limit.
 * Rejects `http:`, `javascript:`, `data:`, relative URLs, control characters, and malformed URLs.
 */
export function toSafeHttpsUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  if (CONTROL_CHAR_PATTERN.test(trimmed)) return null;
  if (!trimmed.toLowerCase().startsWith('https://')) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export interface BasecampMapsLinks {
  customMapsUrl: string | null;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
}

export function buildBasecampMapsLinks(
  basecampName: string | null | undefined,
  basecampAddress: string | null | undefined,
  basecampMapsUrl: string | null | undefined,
): BasecampMapsLinks {
  const customMapsUrl = toSafeHttpsUrl(basecampMapsUrl);
  const queryParts = [basecampName?.trim(), basecampAddress?.trim()].filter(
    (part): part is string => Boolean(part),
  );

  if (queryParts.length === 0) {
    return {
      customMapsUrl,
      googleMapsUrl: null,
      appleMapsUrl: null,
    };
  }

  const encodedQuery = encodeURIComponent(queryParts.join(', '));
  return {
    customMapsUrl,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
    appleMapsUrl: `https://maps.apple.com/?q=${encodedQuery}`,
  };
}
