import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Announcement } from '../../types/domain';
import { AnnouncementsFeed } from './AnnouncementsFeed';

function makeAnnouncement(overrides: Partial<Announcement> & { id: string }): Announcement {
  return {
    eventId: 'evt-1',
    title: null,
    body: 'Default update',
    isPinned: false,
    createdAt: '2027-01-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('AnnouncementsFeed', () => {
  it('renders pinned announcements visually anchored at the top with non-color-only pinned badges, followed by newest-first chronological updates', () => {
    const unsorted: Announcement[] = [
      makeAnnouncement({
        id: 'a-old',
        title: 'Parking reminder',
        body: 'Overflow lot opens at 7:30 AM.',
        isPinned: false,
        createdAt: '2027-01-08T14:00:00.000Z',
      }),
      makeAnnouncement({
        id: 'a-pinned-older',
        title: 'Icy bridge caution',
        body: 'Watch the wooden bridge near km 2.',
        isPinned: true,
        createdAt: '2027-01-09T11:00:00.000Z',
      }),
      makeAnnouncement({
        id: 'a-new',
        title: 'Hot cocoa ready',
        body: 'Kettle is hot inside Basecamp.',
        isPinned: false,
        createdAt: '2027-01-09T13:30:00.000Z',
      }),
      makeAnnouncement({
        id: 'a-pinned-newer',
        title: 'Round 1 starts on time',
        body: 'Gather outside Basecamp at 7:55 AM.',
        isPinned: true,
        createdAt: '2027-01-09T12:30:00.000Z',
      }),
    ];

    render(<AnnouncementsFeed announcements={unsorted} timezone="America/New_York" />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);

    // Pinned announcements come first (newest pinned first), then regular announcements (newest first)
    expect(within(items[0]).getByText('Round 1 starts on time')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Pinned/i)).toBeInTheDocument();

    expect(within(items[1]).getByText('Icy bridge caution')).toBeInTheDocument();
    expect(within(items[1]).getByText(/Pinned/i)).toBeInTheDocument();

    expect(within(items[2]).getByText('Hot cocoa ready')).toBeInTheDocument();
    expect(within(items[2]).queryByText(/Pinned/i)).not.toBeInTheDocument();

    expect(within(items[3]).getByText('Parking reminder')).toBeInTheDocument();
    expect(within(items[3]).queryByText(/Pinned/i)).not.toBeInTheDocument();
  });

  it('renders a warm empty state when there are no Announcements', () => {
    render(<AnnouncementsFeed announcements={[]} timezone="America/New_York" />);
    expect(screen.getByRole('heading', { name: /Announcements/i })).toBeInTheDocument();
    expect(screen.getByText(/No Organizer announcements yet/i)).toBeInTheDocument();
  });
});
