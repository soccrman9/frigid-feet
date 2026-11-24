import { describe, expect, it } from 'vitest';
import { buildBasecampMapsLinks, toSafeHttpsUrl } from './urlSafety';

describe('toSafeHttpsUrl', () => {
  it('accepts valid https:// URLs and trims surrounding whitespace', () => {
    expect(toSafeHttpsUrl('https://www.strava.com/clubs/winter-grind-50k')).toBe(
      'https://www.strava.com/clubs/winter-grind-50k',
    );
    expect(toSafeHttpsUrl('  https://connect.garmin.com/modern/course/12345  ')).toBe(
      'https://connect.garmin.com/modern/course/12345',
    );
  });

  it('rejects null, empty, non-https protocols, relative URLs, and URLs over 500 characters', () => {
    expect(toSafeHttpsUrl(null)).toBeNull();
    expect(toSafeHttpsUrl(undefined)).toBeNull();
    expect(toSafeHttpsUrl('')).toBeNull();
    expect(toSafeHttpsUrl('   ')).toBeNull();
    expect(toSafeHttpsUrl('http://example.com/route')).toBeNull();
    expect(toSafeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeHttpsUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(toSafeHttpsUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafeHttpsUrl('ftp://files.example.com/course.gpx')).toBeNull();
    expect(toSafeHttpsUrl('/relative/path')).toBeNull();
    expect(toSafeHttpsUrl('https://')).toBeNull();
    expect(toSafeHttpsUrl('https://example.com/' + 'a'.repeat(490))).toBeNull();
  });

  it('rejects URLs containing control characters or embedded newlines', () => {
    expect(toSafeHttpsUrl('https://example.com/route\njavascript:alert(1)')).toBeNull();
    expect(toSafeHttpsUrl('https://example.com/route\u0000evil')).toBeNull();
  });
});

describe('buildBasecampMapsLinks', () => {
  it('builds Google Maps and Apple Maps https:// links from Basecamp address', () => {
    const links = buildBasecampMapsLinks(
      'Lakeside Warming Pavilion',
      '100 Basecamp Trail, Frost Harbor',
      null,
    );

    expect(links.googleMapsUrl).toBe(
      'https://www.google.com/maps/search/?api=1&query=Lakeside%20Warming%20Pavilion%2C%20100%20Basecamp%20Trail%2C%20Frost%20Harbor',
    );
    expect(links.appleMapsUrl).toBe(
      'https://maps.apple.com/?q=Lakeside%20Warming%20Pavilion%2C%20100%20Basecamp%20Trail%2C%20Frost%20Harbor',
    );
    expect(links.customMapsUrl).toBeNull();
  });

  it('uses a validated custom https:// basecampMapsUrl and drops unsafe custom URLs', () => {
    const safeLinks = buildBasecampMapsLinks(
      'Lakeside Warming Pavilion',
      '100 Basecamp Trail',
      'https://maps.google.com/?q=44.123,-73.456',
    );
    expect(safeLinks.customMapsUrl).toBe('https://maps.google.com/?q=44.123,-73.456');

    const unsafeLinks = buildBasecampMapsLinks(
      'Lakeside Warming Pavilion',
      null,
      'javascript:alert(1)',
    );
    expect(unsafeLinks.customMapsUrl).toBeNull();
    expect(unsafeLinks.googleMapsUrl).toContain('https://www.google.com/maps/search/?api=1&query=');
  });

  it('returns all null links when name, address, and custom URL are all missing', () => {
    expect(buildBasecampMapsLinks(null, null, null)).toEqual({
      customMapsUrl: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
    });
  });
});
