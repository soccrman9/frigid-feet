import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, MapPin } from 'lucide-react';
import { parseGpxXml } from './gpxParser';

interface CourseMapPreviewProps {
  courseName: string;
  basecampName?: string | null;
  gpxXml: string | null;
}

export function CourseMapPreview({
  courseName,
  basecampName,
  gpxXml,
}: CourseMapPreviewProps) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const parsed = useMemo(() => parseGpxXml(gpxXml), [gpxXml]);
  const hasRawGpx = typeof gpxXml === 'string' && gpxXml.trim().length > 0;

  useEffect(() => {
    const container = mapHostRef.current;
    if (!container || !parsed.ok || parsed.points.length === 0) {
      return;
    }

    let map: L.Map | null = null;
    try {
      map = L.map(container, {
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const latLngs: L.LatLngExpression[] = parsed.points.map((pt) => [pt.lat, pt.lon]);

      if (latLngs.length >= 2) {
        const polyline = L.polyline(latLngs, {
          color: '#163A59',
          weight: 4,
          opacity: 0.92,
        }).addTo(map);

        const bounds = polyline.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [22, 22], maxZoom: 16 });
        } else {
          map.setView([parsed.startPoint.lat, parsed.startPoint.lon], 15);
        }
      } else {
        map.setView([parsed.startPoint.lat, parsed.startPoint.lon], 15);
      }

      const startLabel = basecampName
        ? `Start / Finish · ${basecampName}`
        : 'Start / Finish · Basecamp';

      L.circleMarker([parsed.startPoint.lat, parsed.startPoint.lon], {
        radius: 7,
        color: '#0C1E30',
        weight: 2.5,
        fillColor: '#E08A1E',
        fillOpacity: 1,
      })
        .bindPopup(startLabel)
        .addTo(map);
    } catch {
      // Gracefully tolerate headless / jsdom environments where Leaflet SVG layout is unavailable
      if (map) {
        try {
          map.remove();
        } catch {
          // ignore cleanup failure
        }
        map = null;
      }
    }

    return () => {
      if (map) {
        try {
          map.remove();
        } catch {
          // ignore cleanup failure
        }
      }
    };
  }, [parsed, basecampName]);

  if (!hasRawGpx) {
    return (
      <div
        className="flex items-center gap-2.5 rounded border px-3 py-3.5 text-sm"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-hairline)',
          color: 'var(--ink-muted)',
        }}
      >
        <MapIcon size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
        <span>Course GPX file not uploaded yet — check back soon or ask at Basecamp.</span>
      </div>
    );
  }

  if (!parsed.ok) {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded border px-3 py-3.5 text-sm"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
          color: 'var(--ink-muted)',
        }}
      >
        <MapIcon size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
        <span>Map preview unavailable — Course GPX data could not be parsed.</span>
      </div>
    );
  }

  const pointLabel =
    parsed.sourceType === 'trkpt'
      ? parsed.points.length === 1
        ? 'trackpoint'
        : 'trackpoints'
      : parsed.sourceType === 'rtept'
        ? parsed.points.length === 1
          ? 'route point'
          : 'route points'
        : parsed.points.length === 1
          ? 'waypoint'
          : 'waypoints';

  return (
    <div
      className="overflow-hidden rounded border"
      style={{
        borderColor: 'var(--border-structural)',
        backgroundColor: 'var(--bg-rail-subtle)',
      }}
    >
      <div
        ref={mapHostRef}
        role="region"
        aria-label={`${courseName} interactive Course map`}
        className="pfl-leaflet-container h-52 w-full"
      />
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs font-semibold"
        style={{
          borderColor: 'var(--border-hairline)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--ink-secondary)',
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <MapPin
            size={14}
            strokeWidth={2.25}
            aria-hidden="true"
            style={{ color: 'var(--accent-amber)' }}
          />
          <span>
            Start / Finish: {basecampName ? basecampName : 'Basecamp'}
          </span>
        </span>
        <span className="font-telemetry">
          {parsed.points.length} {pointLabel}
        </span>
      </div>
    </div>
  );
}
