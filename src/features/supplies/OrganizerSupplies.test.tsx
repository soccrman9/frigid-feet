import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { saveParticipantId } from '../participant/participantStorage';

async function createOrganizerSuppliesFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const participantApi = new InMemoryEventApi(store);
  await participantApi.ensureSession();
  await participantApi.unlockEvent('2027', 'FROST-2027');

  const host = await organizerApi.createParticipant(eventId, {
    displayName: 'Jordan Host',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 27,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  const samir = await participantApi.createParticipant(eventId, {
    displayName: 'Samir Patel',
    rsvpStatus: 'going_supporter',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: null,
    isFirst5k: false,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  return { store, eventId, organizerApi, participantApi, host, samir };
}

async function openSuppliesTab(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole('navigation', { name: /primary/i });
  await user.click(within(nav).getByRole('button', { name: /supplies/i }));
  await screen.findByRole('heading', { name: /^supplies$/i });
}

describe('Organizer Supplies Controls — Wish-List CRUD & Moderation', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('lets an unlocked Organizer create, edit, and delete wish-list Supply items with category and target_slots >= 1 validation', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, host } = await createOrganizerSuppliesFixture();
    saveParticipantId(eventId, host.id);

    render(<App eventApi={organizerApi} />);
    await openSuppliesTab(user);

    const wishlistSection = screen.getByRole('region', { name: /wish list/i });

    // Validation: blank name rejected
    const addBtn = within(wishlistSection).getByRole('button', { name: /add wish-list supply/i });
    expect(addBtn.className).toContain('min-h-[44px]');
    await user.click(addBtn);
    expect(await within(wishlistSection).findByRole('alert')).toHaveTextContent(
      /enter a supply name/i,
    );

    // Validation: target_slots < 1 rejected
    const nameInput = within(wishlistSection).getByLabelText(/wish-list supply name/i);
    const categorySelect = within(wishlistSection).getByLabelText(/wish-list category/i);
    const slotsInput = within(wishlistSection).getByLabelText(/target slots/i);

    await user.type(nameInput, 'Hand Warmers');
    await user.clear(slotsInput);
    await user.type(slotsInput, '0');
    await user.click(addBtn);
    expect(await within(wishlistSection).findByRole('alert')).toHaveTextContent(/at least 1/i);

    // Valid creation: Gear / First Aid, 3 target slots
    await user.selectOptions(categorySelect, 'gear_first_aid');
    await user.clear(slotsInput);
    await user.type(slotsInput, '3');
    await user.click(addBtn);

    const itemCard = await within(wishlistSection).findByRole('article', {
      name: /hand warmers/i,
    });
    expect(within(itemCard).getByText('0 of 3 claimed')).toBeInTheDocument();
    expect(within(itemCard).getByText('3 needed')).toBeInTheDocument();

    // Verify persisted in EventApi
    let snap = await organizerApi.getEventSnapshot(eventId);
    const created = snap.supplyItems.find((item) => item.name === 'Hand Warmers');
    expect(created).toMatchObject({
      category: 'gear_first_aid',
      isWishlist: true,
      targetSlots: 3,
    });

    // Edit wish-list Supply: rename, switch category to Drinks, change targetSlots to 2
    const editBtn = within(itemCard).getByRole('button', { name: /^edit$/i });
    expect(editBtn.className).toContain('min-h-[44px]');
    await user.click(editBtn);

    const editName = within(itemCard).getByLabelText(/edit wish-list supply name/i);
    const editCategory = within(itemCard).getByLabelText(/edit wish-list category/i);
    const editSlots = within(itemCard).getByLabelText(/edit target slots/i);

    await user.clear(editName);
    await user.type(editName, 'Hot Cider Carafe');
    await user.selectOptions(editCategory, 'drinks');
    await user.clear(editSlots);
    await user.type(editSlots, '2');
    await user.click(within(itemCard).getByRole('button', { name: /^save$/i }));

    const updatedCard = await within(wishlistSection).findByRole('article', {
      name: /hot cider carafe/i,
    });
    expect(within(updatedCard).getByText('0 of 2 claimed')).toBeInTheDocument();
    expect(within(wishlistSection).getByRole('heading', { name: /^drinks$/i })).toBeInTheDocument();

    snap = await organizerApi.getEventSnapshot(eventId);
    expect(snap.supplyItems.find((item) => item.id === created?.id)).toMatchObject({
      name: 'Hot Cider Carafe',
      category: 'drinks',
      isWishlist: true,
      targetSlots: 2,
    });

    // Delete wish-list Supply
    const deleteBtn = within(updatedCard).getByRole('button', { name: /^delete$/i });
    expect(deleteBtn.className).toContain('min-h-[44px]');
    await user.click(deleteBtn);

    expect(
      within(wishlistSection).queryByRole('article', { name: /hot cider carafe/i }),
    ).not.toBeInTheDocument();

    snap = await organizerApi.getEventSnapshot(eventId);
    expect(snap.supplyItems.filter((item) => item.isWishlist)).toHaveLength(0);
  });

  it('lets an unlocked Organizer remove any Participant claim and any stale volunteered Supply item while keeping them hidden for regular Participants', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, participantApi, host, samir } =
      await createOrganizerSuppliesFixture();

    const soup = await organizerApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Crockpot Soup',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });

    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: soup.id,
      participantId: samir.id,
      note: 'Tomato basil',
    });

    await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Stale Pretzels',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: samir.id,
    });

    // First verify regular Participant (host via participantApi without organizer grant) sees NO Organizer controls
    saveParticipantId(eventId, host.id);
    const { unmount } = render(<App eventApi={participantApi} />);
    await openSuppliesTab(user);

    const lockedWishlist = screen.getByRole('region', { name: /wish list/i });
    expect(
      within(lockedWishlist).queryByRole('button', { name: /add wish-list supply/i }),
    ).not.toBeInTheDocument();
    const lockedSoupCard = within(lockedWishlist).getByRole('article', { name: /crockpot soup/i });
    expect(within(lockedSoupCard).queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();

    const lockedVolunteered = screen.getByRole('region', { name: /volunteered supplies/i });
    const lockedPretzelCard = within(lockedVolunteered).getByRole('article', {
      name: /stale pretzels/i,
    });
    expect(
      within(lockedPretzelCard).queryByRole('button', { name: /remove|delete/i }),
    ).not.toBeInTheDocument();
    unmount();

    // Now render with Organizer Mode unlocked
    render(<App eventApi={organizerApi} />);
    await openSuppliesTab(user);

    // Organizer removes Samir's wish-list claim
    const soupCard = screen.getByRole('article', { name: /crockpot soup/i });
    expect(within(soupCard).getByText('1 of 2 claimed')).toBeInTheDocument();
    const removeClaimBtn = within(soupCard).getByRole('button', {
      name: /remove samir patel/i,
    });
    expect(removeClaimBtn.className).toContain('min-h-[44px]');
    await user.click(removeClaimBtn);

    expect(await within(soupCard).findByText('0 of 2 claimed')).toBeInTheDocument();
    expect(within(soupCard).queryByText('Samir Patel')).not.toBeInTheDocument();

    // Organizer removes Samir's stale volunteered Supply item
    const volunteeredSection = screen.getByRole('region', { name: /volunteered supplies/i });
    const pretzelCard = within(volunteeredSection).getByRole('article', {
      name: /stale pretzels/i,
    });
    const removeVolunteeredBtn = within(pretzelCard).getByRole('button', { name: /remove/i });
    expect(removeVolunteeredBtn.className).toContain('min-h-[44px]');
    await user.click(removeVolunteeredBtn);

    expect(
      within(volunteeredSection).queryByRole('article', { name: /stale pretzels/i }),
    ).not.toBeInTheDocument();

    const snap = await organizerApi.getEventSnapshot(eventId);
    expect(snap.supplyClaims).toHaveLength(0);
    expect(snap.supplyItems.filter((i) => !i.isWishlist)).toHaveLength(0);
  });

  it('disables Organizer wish-list and moderation buttons with Requires connection when offline', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, participantApi, host, samir } =
      await createOrganizerSuppliesFixture();

    const soup = await organizerApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Crockpot Soup',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });
    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: soup.id,
      participantId: samir.id,
      note: null,
    });
    await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Stale Pretzels',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: samir.id,
    });

    saveParticipantId(eventId, host.id);
    render(<App eventApi={organizerApi} />);
    await openSuppliesTab(user);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    const wishlistSection = screen.getByRole('region', { name: /wish list/i });
    const offlineWishlistBtns = within(wishlistSection).getAllByRole('button', {
      name: /requires connection/i,
    });
    expect(offlineWishlistBtns.length).toBeGreaterThanOrEqual(2);
    for (const btn of offlineWishlistBtns) {
      expect(btn).toBeDisabled();
    }

    const soupCard = within(wishlistSection).getByRole('article', { name: /crockpot soup/i });
    expect(within(soupCard).getByRole('button', { name: /^edit$/i })).toBeDisabled();
    expect(within(soupCard).getByRole('button', { name: /^delete$/i })).toBeDisabled();
    expect(
      within(soupCard).getByRole('button', { name: /remove samir patel/i }),
    ).toBeDisabled();

    const volunteeredSection = screen.getByRole('region', { name: /volunteered supplies/i });
    const pretzelCard = within(volunteeredSection).getByRole('article', {
      name: /stale pretzels/i,
    });
    expect(within(pretzelCard).getByRole('button', { name: /remove/i })).toBeDisabled();
  });
});
