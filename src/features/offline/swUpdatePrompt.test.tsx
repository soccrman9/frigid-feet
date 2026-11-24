import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createManualSwUpdateController,
  useSwUpdatePrompt,
  type SwUpdateAdapter,
} from './useSwUpdatePrompt';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function SwPromptTestHarness({
  pendingQueueCount,
  adapter,
}: {
  pendingQueueCount: number;
  adapter: SwUpdateAdapter;
}) {
  const { showUpdatePrompt, updateAvailable, reloadForUpdate, dismissPrompt } = useSwUpdatePrompt({
    pendingQueueCount,
    adapter,
  });

  return (
    <div>
      <span data-testid="update-available">{String(updateAvailable)}</span>
      <span data-testid="show-prompt">{String(showUpdatePrompt)}</span>
      {showUpdatePrompt && (
        <div role="status" data-testid="sw-update-banner">
          <span>Update available — Reload</span>
          <button type="button" onClick={() => void reloadForUpdate()}>
            Reload
          </button>
          <button type="button" onClick={dismissPrompt}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}

describe('useSwUpdatePrompt & Workbox PWA config', () => {
  it('defers Service Worker update prompt while leg_mutation_queue is non-empty and surfaces it once idle', async () => {
    const updateSwSpy = vi.fn().mockResolvedValue(undefined);
    const controller = createManualSwUpdateController(updateSwSpy);
    const user = userEvent.setup();

    const { rerender } = render(
      <SwPromptTestHarness pendingQueueCount={2} adapter={controller.adapter} />,
    );

    // SW announces a waiting update while 2 Leg mutations are still queued
    act(() => {
      controller.setNeedRefresh(true);
    });

    expect(screen.getByTestId('update-available')).toHaveTextContent('true');
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('false');
    expect(screen.queryByTestId('sw-update-banner')).not.toBeInTheDocument();
    expect(updateSwSpy).not.toHaveBeenCalled();

    // Still deferred while 1 item remains
    rerender(<SwPromptTestHarness pendingQueueCount={1} adapter={controller.adapter} />);
    expect(screen.queryByTestId('sw-update-banner')).not.toBeInTheDocument();

    // Queue empties -> gentle "Update available — Reload" prompt appears
    rerender(<SwPromptTestHarness pendingQueueCount={0} adapter={controller.adapter} />);
    const banner = screen.getByTestId('sw-update-banner');
    expect(banner).toHaveTextContent(/update available — reload/i);
    expect(updateSwSpy).not.toHaveBeenCalled();

    // User explicitly taps Reload -> triggers updateServiceWorker(true)
    await user.click(screen.getByRole('button', { name: /^reload$/i }));
    expect(updateSwSpy).toHaveBeenCalledTimes(1);
    expect(updateSwSpy).toHaveBeenCalledWith(true);
  });

  it('configures vite-plugin-pwa with prompt registration, static shell precache, and CacheFirst OSM tile expiration', () => {
    const viteConfig = readFileSync(resolve(repoRoot, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('VitePWA(');
    expect(viteConfig).toMatch(/registerType:\s*['"]prompt['"]/);
    expect(viteConfig).toContain('globPatterns');
    expect(viteConfig).toContain('tile\\.openstreetmap\\.org');
    expect(viteConfig).toMatch(/handler:\s*['"]CacheFirst['"]/);
    expect(viteConfig).toContain('maxEntries');
    expect(viteConfig).toContain('maxAgeSeconds');
    expect(viteConfig).toContain('cacheableResponse');
  });
});
