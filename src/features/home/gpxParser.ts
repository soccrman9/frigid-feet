export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
}

export interface GpxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export type GpxPointTag = 'trkpt' | 'rtept' | 'wpt';

export type GpxParseResult =
  | {
      ok: true;
      points: GpxPoint[];
      bounds: GpxBounds;
      startPoint: GpxPoint;
      endPoint: GpxPoint;
      name: string | null;
      sourceType: GpxPointTag;
    }
  | {
      ok: false;
      error: string;
      points: [];
    };

function queryElements(doc: Document | Element, localName: string): Element[] {
  const nsNodes = doc.getElementsByTagNameNS('*', localName);
  if (nsNodes.length > 0) {
    return Array.from(nsNodes);
  }
  return Array.from(doc.getElementsByTagName(localName));
}

function extractPointElements(doc: Document): { tag: GpxPointTag; elements: Element[] } | null {
  const candidates: GpxPointTag[] = ['trkpt', 'rtept', 'wpt'];
  for (const tag of candidates) {
    const elements = queryElements(doc, tag);
    if (elements.length > 0) {
      return { tag, elements };
    }
  }
  return null;
}

function extractGpxName(doc: Document): string | null {
  for (const containerTag of ['trk', 'rte', 'metadata']) {
    const containers = queryElements(doc, containerTag);
    for (const container of containers) {
      const nameNode = queryElements(container, 'name')[0];
      const text = nameNode?.textContent?.trim();
      if (text) return text;
    }
  }
  const fallbackName = queryElements(doc, 'name')[0]?.textContent?.trim();
  return fallbackName || null;
}

export function parseGpxXml(xml: string | null | undefined): GpxParseResult {
  if (typeof xml !== 'string' || !xml.trim()) {
    return {
      ok: false,
      error: 'No GPX XML provided.',
      points: [],
    };
  }

  if (typeof DOMParser === 'undefined') {
    return {
      ok: false,
      error: 'GPX parser is unavailable in this environment.',
      points: [],
    };
  }

  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xml.trim(), 'application/xml');
  } catch {
    return {
      ok: false,
      error: 'Unable to parse malformed GPX XML.',
      points: [],
    };
  }

  const hasParserError =
    doc.getElementsByTagName('parsererror').length > 0 ||
    doc.getElementsByTagNameNS('*', 'parsererror').length > 0;

  if (hasParserError) {
    return {
      ok: false,
      error: 'Invalid or malformed GPX XML.',
      points: [],
    };
  }

  const extracted = extractPointElements(doc);
  if (!extracted) {
    return {
      ok: false,
      error: 'No GPX trackpoints, route points, or waypoints found.',
      points: [],
    };
  }

  const points: GpxPoint[] = [];
  for (const el of extracted.elements) {
    const latAttr = el.getAttribute('lat');
    const lonAttr = el.getAttribute('lon');
    if (latAttr === null || lonAttr === null) continue;

    const lat = Number(latAttr);
    const lon = Number(lonAttr);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      continue;
    }

    const eleText = queryElements(el, 'ele')[0]?.textContent?.trim();
    const ele = eleText !== undefined && eleText !== '' ? Number(eleText) : undefined;
    const point: GpxPoint =
      ele !== undefined && Number.isFinite(ele) ? { lat, lon, ele } : { lat, lon };
    points.push(point);
  }

  if (points.length === 0) {
    return {
      ok: false,
      error: 'No valid coordinates found in GPX XML.',
      points: [],
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;

  for (const pt of points) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lon < minLon) minLon = pt.lon;
    if (pt.lon > maxLon) maxLon = pt.lon;
  }

  return {
    ok: true,
    points,
    bounds: { minLat, maxLat, minLon, maxLon },
    startPoint: points[0],
    endPoint: points[points.length - 1],
    name: extractGpxName(doc),
    sourceType: extracted.tag,
  };
}

export function buildGpxFilename(courseName: string): string {
  const slug = courseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'course'}.gpx`;
}

export function downloadCourseGpx(courseName: string, gpxXml: string): boolean {
  if (typeof gpxXml !== 'string' || !gpxXml.trim()) return false;
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }

  const blob = new Blob([gpxXml], { type: 'application/gpx+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = buildGpxFilename(courseName);
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
