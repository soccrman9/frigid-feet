import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tv,
} from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import { generateQrCodeSvg, generateQrMatrix } from './qrCode';

const READABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const URL_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomFromAlphabet(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[bytes[i] % alphabet.length];
  }
  return output;
}

function generateFriendlyInviteCode(): string {
  return `GRIND-${randomFromAlphabet(READABLE_ALPHABET, 6)}`;
}

function generateHighEntropyToken(): string {
  return randomFromAlphabet(URL_SAFE_ALPHABET, 32);
}

function getAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return 'https://winter-grind-50k.pages.dev';
}

function buildQrPathData(modules: boolean[][], quietZone: number): string {
  const commands: string[] = [];
  for (let r = 0; r < modules.length; r += 1) {
    for (let c = 0; c < modules[r].length; c += 1) {
      if (modules[r][c]) {
        commands.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }
  return commands.join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function downloadSvgFile(svgMarkup: string, filename: string): void {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

const INPUT_CLASS =
  'pfl-focus-ring font-telemetry min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold';
const LABEL_CLASS = 'mb-1 block text-xs font-bold tracking-wider uppercase';
const INPUT_STYLE = {
  backgroundColor: 'var(--bg-ground)',
  borderColor: 'var(--border-strong)',
  color: 'var(--ink-primary)',
};

export function OrganizerSecretsSection() {
  const { eventApi, eventId, snapshot, isOnline, refreshGrants } = useEventData();
  const { event } = snapshot;

  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [capturedInviteCode, setCapturedInviteCode] = useState<string | null>(null);

  const [dashboardTokenInput, setDashboardTokenInput] = useState('');
  const [capturedDashboardToken, setCapturedDashboardToken] = useState<string | null>(null);

  const [newPasscodeInput, setNewPasscodeInput] = useState('');

  const [busySecret, setBusySecret] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'invite' | 'dashboard' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const origin = getAppOrigin();
  const inviteUrl = capturedInviteCode
    ? `${origin}/e/${encodeURIComponent(event.slug)}?code=${encodeURIComponent(capturedInviteCode)}`
    : null;

  const dashboardUrl = capturedDashboardToken
    ? `${origin}/dashboard/${encodeURIComponent(capturedDashboardToken)}`
    : null;

  const qrRenderModel = useMemo(() => {
    if (!inviteUrl) return null;
    try {
      const matrix = generateQrMatrix(inviteUrl);
      const quietZone = 4;
      return {
        ok: true as const,
        totalSize: matrix.size + quietZone * 2,
        pathData: buildQrPathData(matrix.modules, quietZone),
        svgMarkup: generateQrCodeSvg(inviteUrl, {
          quietZone,
          title: `${event.name} invite QR code`,
        }),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Could not build QR code for this URL.',
      };
    }
  }, [inviteUrl, event.name]);

  async function handleRotateInviteCode(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to rotate Event secrets.');
      return;
    }
    const trimmed = inviteCodeInput.trim();
    if (!trimmed) {
      setErrorMessage('Enter a new Event invite code before rotating.');
      return;
    }

    setBusySecret('invite_code');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.rotateEventSecret(eventId, 'invite_code', trimmed);
      await refreshGrants();
      setCapturedInviteCode(trimmed);
      setStatusMessage(
        'Invite code rotated. Existing Participant sessions were revoked — share the updated invite link or QR code below.',
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not rotate invite code.');
    } finally {
      setBusySecret(null);
    }
  }

  function handleUseCurrentInviteCodeLocally() {
    const trimmed = inviteCodeInput.trim();
    if (!trimmed) {
      setErrorMessage('Enter the Event invite code to build the shareable link and QR code.');
      return;
    }
    setErrorMessage(null);
    setCapturedInviteCode(trimmed);
    setStatusMessage('Invite link & QR code ready below (existing sessions unchanged).');
  }

  async function handleRotateDashboardToken(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to rotate Event secrets.');
      return;
    }
    const trimmed = dashboardTokenInput.trim();
    if (!trimmed) {
      setErrorMessage('Enter or generate a new Basecamp Dashboard token before rotating.');
      return;
    }

    setBusySecret('dashboard_token');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.rotateEventSecret(eventId, 'dashboard_token', trimmed);
      await refreshGrants();
      setCapturedDashboardToken(trimmed);
      setStatusMessage(
        'Basecamp Dashboard token rotated. Previous Dashboard sessions were revoked — use the new link below.',
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not rotate Dashboard token.');
    } finally {
      setBusySecret(null);
    }
  }

  function handleUseCurrentDashboardTokenLocally() {
    const trimmed = dashboardTokenInput.trim();
    if (!trimmed) {
      setErrorMessage('Enter the Dashboard token to build the Basecamp Dashboard link.');
      return;
    }
    setErrorMessage(null);
    setCapturedDashboardToken(trimmed);
    setStatusMessage('Basecamp Dashboard link ready below (existing sessions unchanged).');
  }

  async function handleRotateOrganizerPasscode(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to rotate Event secrets.');
      return;
    }
    const trimmed = newPasscodeInput.trim();
    if (!trimmed) {
      setErrorMessage('Enter a new Organizer passcode before rotating.');
      return;
    }

    setBusySecret('organizer_passcode');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.rotateEventSecret(eventId, 'organizer_passcode', trimmed);
      await refreshGrants();
      setNewPasscodeInput('');
      setStatusMessage(
        'Organizer passcode rotated. Other Organizer sessions were revoked while your session remains active.',
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not rotate Organizer passcode.');
    } finally {
      setBusySecret(null);
    }
  }

  async function handleCopy(target: 'invite' | 'dashboard', value: string) {
    try {
      await copyTextToClipboard(value);
      setCopiedTarget(target);
      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? null : current));
      }, 2500);
    } catch {
      setErrorMessage('Clipboard copy was blocked by the browser. Select and copy the URL directly.');
    }
  }

  function handleDownloadQr() {
    if (!qrRenderModel || !qrRenderModel.ok) return;
    downloadSvgFile(qrRenderModel.svgMarkup, `winter-grind-${event.slug}-invite-qr.svg`);
  }

  function handlePrintQr() {
    if (!qrRenderModel || !qrRenderModel.ok || !inviteUrl) return;
    const popup = typeof window.open === 'function' ? window.open('', '_blank', 'width=640,height=760') : null;
    if (popup && popup.document) {
      const safeTitle = escapeHtml(event.name);
      const safeCode = escapeHtml(capturedInviteCode ?? '');
      const safeUrl = escapeHtml(inviteUrl);
      popup.document.open();
      popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle} — Invite QR</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #0c1e30; text-align: center; padding: 32px; }
    .qr { width: 280px; height: 280px; margin: 20px auto; border: 2px solid #0c1e30; padding: 12px; background: #fff; }
    .qr svg { width: 100%; height: 100%; display: block; }
    .code { font-family: monospace; font-size: 20px; font-weight: 700; margin-top: 12px; }
    .url { font-family: monospace; font-size: 12px; color: #3b556e; word-break: break-all; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>Scan to unlock the Event &amp; check in at Basecamp</p>
  <div class="qr">${qrRenderModel.svgMarkup}</div>
  <div class="code">Invite Code: ${safeCode}</div>
  <div class="url">${safeUrl}</div>
</body>
</html>`);
      popup.document.close();
      popup.focus();
      popup.print();
      return;
    }
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Access Links, Invite QR &amp; Secret Rotation
        </h3>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Secrets are stored as one-way hashes on the server and cannot be read back. Enter a
          current secret locally or rotate to a new value to build shareable links and a printable
          walk-in QR code.
        </p>
      </div>

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

      {/* 1. Event Invite Code + Shareable Link + Scannable SVG QR */}
      <form
        onSubmit={handleRotateInviteCode}
        className="flex flex-col gap-3 rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
        noValidate
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <KeyRound size={15} strokeWidth={2.25} aria-hidden="true" style={{ color: 'var(--ink-secondary)' }} />
            <h4 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Event Invite Code &amp; Walk-In QR
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setInviteCodeInput(generateFriendlyInviteCode())}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>Generate Code</span>
          </button>
        </div>

        <div>
          <label htmlFor="org-invite-code" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Event invite code
          </label>
          <input
            id="org-invite-code"
            type="text"
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value)}
            placeholder="e.g. WINTER50K"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Rotating revokes existing Participant sessions so friends unlock with the new link or code.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!isOnline || busySecret !== null}
            className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: 'var(--accent-amber-cta)',
              color: '#0C1E30',
            }}
          >
            <RefreshCw size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>
              {!isOnline
                ? 'Requires connection'
                : busySecret === 'invite_code'
                  ? 'Rotating…'
                  : 'Rotate Invite Code'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleUseCurrentInviteCodeLocally}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            Preview Link &amp; QR Only
          </button>
        </div>

        {inviteUrl && (
          <div
            className="mt-1 flex flex-col gap-3 rounded-md border p-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div>
              <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
                Shareable Invite Link
              </p>
              <p
                className="font-telemetry mt-1 rounded border p-2 text-xs break-all select-all"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--ink-primary)',
                }}
              >
                {inviteUrl}
              </p>
            </div>

            {qrRenderModel && qrRenderModel.ok ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  data-testid="invite-qr-preview"
                  className="rounded-md border bg-white p-2"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox={`0 0 ${qrRenderModel.totalSize} ${qrRenderModel.totalSize}`}
                    width={196}
                    height={196}
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`Scannable invite QR code for ${event.name}`}
                  >
                    <title>{`${event.name} invite QR code`}</title>
                    <rect
                      width={qrRenderModel.totalSize}
                      height={qrRenderModel.totalSize}
                      fill="#ffffff"
                    />
                    <path d={qrRenderModel.pathData} fill="#000000" />
                  </svg>
                </div>
                <p className="text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  Scan at Basecamp to auto-unlock and strip the code from the browser bar.
                </p>
              </div>
            ) : qrRenderModel ? (
              <p className="text-xs font-semibold" style={{ color: 'var(--accent-error)' }}>
                {qrRenderModel.error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCopy('invite', inviteUrl)}
                className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-xs font-bold"
                style={{
                  backgroundColor: 'var(--shell-header)',
                  color: 'var(--ink-on-shell)',
                }}
              >
                {copiedTarget === 'invite' ? (
                  <>
                    <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    <span>Copied Invite Link</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden="true" />
                    <span>Copy Invite Link</span>
                  </>
                )}
              </button>

              {qrRenderModel && qrRenderModel.ok && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-rail-subtle)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <Download size={14} aria-hidden="true" />
                    <span>Download QR (.svg)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintQr}
                    className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-rail-subtle)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <Printer size={14} aria-hidden="true" />
                    <span>Print QR</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </form>

      {/* 2. Basecamp Dashboard Token */}
      <form
        onSubmit={handleRotateDashboardToken}
        className="flex flex-col gap-3 rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
        noValidate
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Tv size={15} strokeWidth={2.25} aria-hidden="true" style={{ color: 'var(--ink-secondary)' }} />
            <h4 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Basecamp Dashboard Link
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setDashboardTokenInput(generateHighEntropyToken())}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>Generate Token</span>
          </button>
        </div>

        <div>
          <label htmlFor="org-dashboard-token" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Basecamp Dashboard token
          </label>
          <input
            id="org-dashboard-token"
            type="text"
            value={dashboardTokenInput}
            onChange={(e) => setDashboardTokenInput(e.target.value)}
            placeholder="High-entropy read-only token"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Unlisted read-only link for the shared Basecamp laptop/TV. Rotating revokes active Dashboard sessions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!isOnline || busySecret !== null}
            className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <RefreshCw size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>
              {!isOnline
                ? 'Requires connection'
                : busySecret === 'dashboard_token'
                  ? 'Rotating…'
                  : 'Rotate Dashboard Token'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleUseCurrentDashboardTokenLocally}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            Build Link Only
          </button>
        </div>

        {dashboardUrl && (
          <div
            className="flex flex-col gap-2 rounded-md border p-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Read-Only Basecamp Dashboard URL
            </p>
            <p
              className="font-telemetry rounded border p-2 text-xs break-all select-all"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-hairline)',
                color: 'var(--ink-primary)',
              }}
            >
              {dashboardUrl}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy('dashboard', dashboardUrl)}
              className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-xs font-bold"
              style={{
                backgroundColor: 'var(--shell-header)',
                color: 'var(--ink-on-shell)',
              }}
            >
              {copiedTarget === 'dashboard' ? (
                <>
                  <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                  <span>Copied Dashboard Link</span>
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden="true" />
                  <span>Copy Dashboard Link</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* 3. Organizer Passcode */}
      <form
        onSubmit={handleRotateOrganizerPasscode}
        className="flex flex-col gap-3 rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
        noValidate
      >
        <div className="flex items-center gap-1.5">
          <ShieldAlert size={15} strokeWidth={2.25} aria-hidden="true" style={{ color: 'var(--ink-secondary)' }} />
          <h4 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
            Organizer Passcode
          </h4>
        </div>

        <div>
          <label htmlFor="org-new-passcode" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            New Organizer passcode
          </label>
          <input
            id="org-new-passcode"
            type="password"
            autoComplete="new-password"
            value={newPasscodeInput}
            onChange={(e) => setNewPasscodeInput(e.target.value)}
            placeholder="Enter new shared Organizer passcode"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Revokes other Organizer sessions while keeping your current Organizer session active.
          </p>
        </div>

        <button
          type="submit"
          disabled={!isOnline || busySecret !== null}
          className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
          style={{
            backgroundColor: 'var(--shell-header)',
            color: 'var(--ink-on-shell)',
          }}
        >
          <RefreshCw size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>
            {!isOnline
              ? 'Requires connection'
              : busySecret === 'organizer_passcode'
                ? 'Rotating…'
                : 'Rotate Organizer Passcode'}
          </span>
        </button>
      </form>
    </div>
  );
}
