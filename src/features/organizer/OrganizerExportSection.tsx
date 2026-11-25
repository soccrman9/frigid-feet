import { useState } from 'react';
import {
  Check,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import {
  SNAPSHOT_EXPORT_TABLES,
  buildSnapshotFilename,
  serializeEventSnapshotCsv,
  serializeEventSnapshotJson,
  triggerFileDownload,
} from './eventSnapshotExport';

export function OrganizerExportSection() {
  const { snapshot, isOnline, refreshSnapshot } = useEventData();
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport(format: 'json' | 'csv') {
    if (!isOnline) {
      setErrorMessage('Requires connection to export a fresh Event Snapshot.');
      return;
    }

    setExportingFormat(format);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const freshSnapshot = await refreshSnapshot();
      const exportedAt = new Date().toISOString();
      const filename = buildSnapshotFilename(freshSnapshot.event.slug, format, exportedAt);

      if (format === 'json') {
        const jsonContent = serializeEventSnapshotJson(freshSnapshot, exportedAt);
        triggerFileDownload(jsonContent, 'application/json;charset=utf-8', filename);
      } else {
        const csvContent = serializeEventSnapshotCsv(freshSnapshot, exportedAt);
        triggerFileDownload(csvContent, 'text/csv;charset=utf-8', filename);
      }

      setStatusMessage(`Downloaded ${filename}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not export Event Snapshot. Please try again.',
      );
    } finally {
      setExportingFormat(null);
    }
  }

  const summaryItems = [
    { label: 'Participants', count: snapshot.participants.length },
    { label: 'Teams', count: snapshot.teams.length },
    { label: 'Legs', count: snapshot.legs.length },
    { label: 'Supplies', count: snapshot.supplyItems.length },
    { label: 'Chip-Ins', count: snapshot.chipIns.length },
    { label: 'Badges', count: snapshot.badgeAwards.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Event Snapshot Backup (JSON &amp; CSV)
        </h3>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Download a complete pre-Event backup or post-Event archive directly to your device.
          Includes all {SNAPSHOT_EXPORT_TABLES.length} standard Event tables (including Organizer
          chip-in records) for <strong>{snapshot.event.name}</strong>.
        </p>
      </div>

      {/* Explicit security & scope notice */}
      <div
        className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs leading-relaxed"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
          color: 'var(--ink-muted)',
        }}
      >
        <ShieldCheck
          size={15}
          strokeWidth={2.3}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent-spruce)' }}
        />
        <span>
          <strong style={{ color: 'var(--ink-primary)' }}>Secrets excluded:</strong> Event invite
          codes, Organizer passcodes, Dashboard tokens, and hashes in <code>event_secrets</code> are
          never queried or included in snapshot exports.
        </span>
      </div>

      {/* Current Event record counts */}
      <div
        className="rounded-md border p-3"
        style={{
          backgroundColor: 'var(--bg-ground)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <p
          className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          <Database size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>Current Event Records</span>
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded border px-2 py-1.5 text-center"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-hairline)',
              }}
            >
              <dt
                className="text-[11px] font-semibold"
                style={{ color: 'var(--ink-secondary)' }}
              >
                {item.label}
              </dt>
              <dd
                className="font-telemetry mt-0.5 text-base font-bold tabular-nums"
                style={{ color: 'var(--ink-primary)' }}
              >
                {item.count}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {!isOnline && (
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--accent-amber-soft)',
            borderColor: 'var(--accent-amber)',
            color: 'var(--accent-amber-ink)',
          }}
        >
          <WifiOff size={15} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
          <span>Requires connection to fetch and export a fresh Event Snapshot.</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-error-bg)',
            borderColor: 'var(--accent-error-border)',
            color: 'var(--accent-error)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-spruce-soft)',
            borderColor: 'var(--accent-spruce)',
            color: 'var(--accent-spruce)',
          }}
        >
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* One-tap gloved-thumb download actions */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          disabled={!isOnline || exportingFormat !== null}
          onClick={() => void handleExport('json')}
          className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 py-2.5 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: 'var(--shell-header)',
            color: 'var(--ink-on-shell)',
          }}
        >
          <FileJson size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>
            {exportingFormat === 'json'
              ? 'Exporting JSON…'
              : 'Export Event Snapshot (JSON)'}
          </span>
        </button>

        <button
          type="button"
          disabled={!isOnline || exportingFormat !== null}
          onClick={() => void handleExport('csv')}
          className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] px-4 py-2.5 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-primary)',
          }}
        >
          <FileSpreadsheet size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>
            {exportingFormat === 'csv'
              ? 'Exporting CSV…'
              : 'Export Event Snapshot (CSV)'}
          </span>
        </button>
      </div>

      <p
        className="flex items-center gap-1.5 text-[11px] leading-relaxed"
        style={{ color: 'var(--ink-secondary)' }}
      >
        <Download size={12} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
        <span>
          JSON preserves structured fields (including chip-in breakdowns and GPX XML). CSV uses RFC
          4180 escaping for clean import into spreadsheets.
        </span>
      </p>
    </div>
  );
}
