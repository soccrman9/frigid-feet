import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGpxFilename, downloadCourseGpx, parseGpxXml } from './gpxParser';

const SAMPLE_TRKPT_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="WinterGrind" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Boardwalk 5K</name>
    <trkseg>
      <trkpt lat="44.4759" lon="-73.2121"><ele>35.2</ele></trkpt>
      <trkpt lat="44.4810" lon="-73.2195"><ele>41.0</ele></trkpt>
      <trkpt lat="44.4761" lon="-73.2123"><ele>35.5</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const SAMPLE_RTEPT_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <rte>
    <name>Lake Loop 5K</name>
    <rtept lat="44.5000" lon="-73.2000" />
    <rtept lat="44.5050" lon="-73.2100" />
  </rte>
</gpx>`;

const SAMPLE_WPT_GPX = `<gpx version="1.1">
  <wpt lat="44.4759" lon="-73.2121"><name>Basecamp</name></wpt>
</gpx>`;

describe('parseGpxXml', () => {
  it('parses namespaced GPX <trkpt> points, elevation, name, start/end points, and bounds', () => {
    const result = parseGpxXml(SAMPLE_TRKPT_GPX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sourceType).toBe('trkpt');
    expect(result.name).toBe('Boardwalk 5K');
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toEqual({ lat: 44.4759, lon: -73.2121, ele: 35.2 });
    expect(result.startPoint).toEqual({ lat: 44.4759, lon: -73.2121, ele: 35.2 });
    expect(result.endPoint).toEqual({ lat: 44.4761, lon: -73.2123, ele: 35.5 });
    expect(result.bounds).toEqual({
      minLat: 44.4759,
      maxLat: 44.481,
      minLon: -73.2195,
      maxLon: -73.2121,
    });
  });

  it('falls back to <rtept> and <wpt> when <trkpt> elements are absent', () => {
    const rteResult = parseGpxXml(SAMPLE_RTEPT_GPX);
    expect(rteResult.ok).toBe(true);
    if (rteResult.ok) {
      expect(rteResult.sourceType).toBe('rtept');
      expect(rteResult.name).toBe('Lake Loop 5K');
      expect(rteResult.points).toHaveLength(2);
    }

    const wptResult = parseGpxXml(SAMPLE_WPT_GPX);
    expect(wptResult.ok).toBe(true);
    if (wptResult.ok) {
      expect(wptResult.sourceType).toBe('wpt');
      expect(wptResult.points).toEqual([{ lat: 44.4759, lon: -73.2121 }]);
    }
  });

  it('handles null, empty, malformed XML, and out-of-range coordinates without throwing', () => {
    expect(parseGpxXml(null).ok).toBe(false);
    expect(parseGpxXml('').ok).toBe(false);
    expect(parseGpxXml('   \n  ').ok).toBe(false);

    const malformed = parseGpxXml('<gpx><trk><trkseg><trkpt lat="44.1"');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.points).toEqual([]);
      expect(malformed.error).toMatch(/invalid|parse|malformed/i);
    }

    const noPoints = parseGpxXml('<gpx><metadata><name>Empty</name></metadata></gpx>');
    expect(noPoints.ok).toBe(false);

    const outOfRange = parseGpxXml(
      '<gpx><trk><trkseg><trkpt lat="120.5" lon="-73.2" /><trkpt lat="44.1" lon="999" /></trkseg></trk></gpx>',
    );
    expect(outOfRange.ok).toBe(false);
  });
});

describe('buildGpxFilename & downloadCourseGpx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds clean slugified .gpx filenames', () => {
    expect(buildGpxFilename('Boardwalk 5K')).toBe('boardwalk-5k.gpx');
    expect(buildGpxFilename('  Pine Ridge & Creek (Alt)  ')).toBe('pine-ridge-creek-alt.gpx');
    expect(buildGpxFilename('   ')).toBe('course.gpx');
  });

  it('triggers a browser .gpx Blob download with application/gpx+xml and cleans up object URLs', () => {
    const createObjectUrlSpy = vi.fn<(obj: Blob | MediaSource) => string>(
      () => 'blob:winter-grind-test',
    );
    const revokeObjectUrlSpy = vi.fn<(url: string) => void>();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrlSpy,
      revokeObjectURL: revokeObjectUrlSpy,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    const ok = downloadCourseGpx('Boardwalk 5K', SAMPLE_TRKPT_GPX);

    expect(ok).toBe(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const createdBlob = createObjectUrlSpy.mock.calls[0][0] as Blob;
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(createdBlob.type).toContain('application/gpx+xml');

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe('A');
    expect(anchor.download).toBe('boardwalk-5k.gpx');
    expect(anchor.href).toBe('blob:winter-grind-test');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:winter-grind-test');

    vi.unstubAllGlobals();
  });

  it('returns false and does not trigger download for empty GPX input', () => {
    expect(downloadCourseGpx('Empty Course', '   ')).toBe(false);
  });
});
