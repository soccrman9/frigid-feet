import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '../../types/domain';
import { ChipInProgressCard } from './ChipInProgressCard';

function makeEvent(overrides?: Partial<EventRecord>): EventRecord {
  return {
    id: 'evt-2027',
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    basecampAddress: '100 Basecamp Trail, Frost Harbor',
    basecampMapsUrl: null,
    parkingAmenitiesNotes: null,
    coldWeatherTips: null,
    safetyFirstAidNotes: null,
    stravaClubUrl: null,
    recapNote: null,
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    chipInBreakdown: [
      { label: 'Basecamp pavilion rental', amountCents: 20000 },
      { label: 'Hot drinks & warming supplies', amountCents: 10000 },
    ],
    venmoHandle: '@wintergrind-50k',
    zelleHandle: 'chipin@wintergrind.test',
    createdAt: '2026-11-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('ChipInProgressCard', () => {
  it('renders aggregate progress ($X of $Y event costs covered), progress bar, suggested amount, itemized breakdown, and reassuring optional copy without contributor counts', () => {
    render(<ChipInProgressCard event={makeEvent()} chipInTotalCents={16550} />);

    const card = screen.getByTestId('chip-in-progress-card');
    expect(card).toHaveTextContent('$165.50 of $300 event costs covered');
    expect(card).toHaveTextContent(/optional/i);
    expect(card).toHaveTextContent(/Suggested:\s*\$15/i);
    expect(card).toHaveTextContent('Basecamp pavilion rental');
    expect(card).toHaveTextContent('$200');
    expect(card).toHaveTextContent('Hot drinks & warming supplies');
    expect(card).toHaveTextContent('$100');

    const bar = screen.getByRole('progressbar', { name: /event costs covered/i });
    expect(bar).toHaveAttribute('aria-valuenow', '55');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');

    // Must never display contributor counts
    expect(card.textContent).not.toMatch(/contributor|donors?|people paid|friends paid/i);
  });

  it('clamps progress bar at 100% and shows calm covered status when total meets or exceeds target', () => {
    render(<ChipInProgressCard event={makeEvent({ chipInTargetCents: 20000 })} chipInTotalCents={24000} />);

    const card = screen.getByTestId('chip-in-progress-card');
    expect(card).toHaveTextContent('$240 of $200 event costs covered');
    expect(card).toHaveTextContent(/Event costs covered/i);

    const bar = screen.getByRole('progressbar', { name: /event costs covered/i });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('handles $0 target gracefully without NaN or Infinity', () => {
    render(
      <ChipInProgressCard
        event={makeEvent({
          chipInTargetCents: 0,
          chipInSuggestedCents: null,
          chipInBreakdown: [],
        })}
        chipInTotalCents={2500}
      />,
    );

    const card = screen.getByTestId('chip-in-progress-card');
    expect(card).toHaveTextContent('$25 of $0 event costs covered');
    expect(card.textContent).not.toContain('NaN');
    expect(card.textContent).not.toContain('Infinity');
    expect(card).toHaveTextContent(/optional/i);
  });

  it('copies configured Venmo and Zelle handles on one-tap (>=44px targets) and displays visual confirmation', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<ChipInProgressCard event={makeEvent()} chipInTotalCents={10000} />);

    const venmoBtn = screen.getByRole('button', { name: /Copy Venmo/i });
    const zelleBtn = screen.getByRole('button', { name: /Copy Zelle/i });

    expect(venmoBtn.className).toContain('min-h-[44px]');
    expect(zelleBtn.className).toContain('min-h-[44px]');

    await user.click(venmoBtn);
    expect(writeText).toHaveBeenCalledWith('@wintergrind-50k');
    await waitFor(() => {
      expect(venmoBtn).toHaveTextContent(/Copied/i);
    });

    await user.click(zelleBtn);
    expect(writeText).toHaveBeenCalledWith('chipin@wintergrind.test');
    await waitFor(() => {
      expect(zelleBtn).toHaveTextContent(/Copied/i);
    });
  });

  it('omits unconfigured payment handles cleanly and reports clipboard failures gracefully', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <ChipInProgressCard
        event={makeEvent({ venmoHandle: '@only-venmo', zelleHandle: null })}
        chipInTotalCents={0}
      />,
    );

    expect(screen.getByRole('button', { name: /Copy Venmo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy Zelle/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy Venmo/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/copy/i);
  });
});
