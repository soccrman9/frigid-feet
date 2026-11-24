import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { saveParticipantId } from '../participant/participantStorage';

async function createSuppliesFixture(options?: {
  includeDietaryNotes?: boolean;
}) {
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

  const maya = await participantApi.createParticipant(eventId, {
    displayName: 'Maya Chen',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 28,
    isFirst5k: false,
    dietaryNotes: options?.includeDietaryNotes ? 'Gluten-free, no peanuts' : null,
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
    dietaryNotes: options?.includeDietaryNotes ? 'Vegetarian' : '   ',
    showTimesOnLeaderboard: false,
  });

  const alex = await participantApi.createParticipant(eventId, {
    displayName: 'Alex Rivera',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 30,
    isFirst5k: true,
    dietaryNotes: null,
    showTimesOnLeaderboard: false,
  });

  return { store, eventId, organizerApi, participantApi, maya, samir, alex };
}

async function openSuppliesTab(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole('navigation', { name: /primary/i });
  await user.click(within(nav).getByRole('button', { name: /supplies/i }));
  await screen.findByRole('heading', { name: /^supplies$/i });
}

describe('SuppliesTab — Dietary Summary Banner, Wish List & Volunteered Supplies', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/e/2027');
  });

  it('displays an attributed Dietary Summary Banner at the top when Participants have dietary notes and hides it cleanly when none are entered', async () => {
    const user = userEvent.setup();

    // Case 1: No dietary notes (null or whitespace-only) -> banner tucked away cleanly
    const emptyFixture = await createSuppliesFixture({ includeDietaryNotes: false });
    saveParticipantId(emptyFixture.eventId, emptyFixture.maya.id);

    const { unmount } = render(<App eventApi={emptyFixture.participantApi} />);
    await openSuppliesTab(user);

    expect(screen.queryByRole('region', { name: /dietary/i })).not.toBeInTheDocument();
    unmount();

    // Case 2: Non-empty dietary notes -> aggregated and clearly attributed
    localStorage.clear();
    const dietaryFixture = await createSuppliesFixture({ includeDietaryNotes: true });
    saveParticipantId(dietaryFixture.eventId, dietaryFixture.maya.id);

    render(<App eventApi={dietaryFixture.participantApi} />);
    await openSuppliesTab(user);

    const dietaryBanner = screen.getByRole('region', { name: /dietary/i });
    expect(within(dietaryBanner).getByText('Maya Chen')).toBeInTheDocument();
    expect(within(dietaryBanner).getByText('Gluten-free, no peanuts')).toBeInTheDocument();
    expect(within(dietaryBanner).getByText('Samir Patel')).toBeInTheDocument();
    expect(within(dietaryBanner).getByText('Vegetarian')).toBeInTheDocument();
    expect(within(dietaryBanner).queryByText('Alex Rivera')).not.toBeInTheDocument();
  });

  it('groups Organizer wish-list Supplies by category with slot counts, non-color-only state cues, and claimer names/notes', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, participantApi, maya, samir, alex } =
      await createSuppliesFixture();

    const chili = await organizerApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Crockpot Chili / Soup',
      isWishlist: true,
      targetSlots: 3,
      createdByParticipantId: null,
    });

    const cocoa = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Cocoa Thermos',
      isWishlist: true,
      targetSlots: 1,
      createdByParticipantId: null,
    });

    await organizerApi.createSupplyItem(eventId, {
      category: 'gear_first_aid',
      name: 'Hand Warmers (bulk pack)',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });

    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: chili.id,
      participantId: maya.id,
      note: 'Veggie white bean chili',
    });
    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: chili.id,
      participantId: samir.id,
      note: null,
    });
    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: cocoa.id,
      participantId: alex.id,
      note: 'Bringing oat milk option too',
    });

    saveParticipantId(eventId, maya.id);
    render(<App eventApi={participantApi} />);
    await openSuppliesTab(user);

    const wishlistSection = screen.getByRole('region', { name: /wish list/i });

    // Category headings present
    expect(within(wishlistSection).getByRole('heading', { name: /^food$/i })).toBeInTheDocument();
    expect(within(wishlistSection).getByRole('heading', { name: /^drinks$/i })).toBeInTheDocument();
    expect(
      within(wishlistSection).getByRole('heading', { name: /^gear \/ first aid$/i }),
    ).toBeInTheDocument();

    // Food item: 2 of 3 claimed, 1 needed, shows Maya's note and Samir's name
    const chiliCard = within(wishlistSection).getByRole('article', {
      name: /crockpot chili \/ soup/i,
    });
    expect(within(chiliCard).getByText('2 of 3 claimed')).toBeInTheDocument();
    expect(within(chiliCard).getByText(/1 needed/i)).toBeInTheDocument();
    expect(within(chiliCard).getByText('Maya Chen')).toBeInTheDocument();
    expect(within(chiliCard).getByText(/Veggie white bean chili/i)).toBeInTheDocument();
    expect(within(chiliCard).getByText('Samir Patel')).toBeInTheDocument();

    // Drinks item: 1 of 1 claimed -> Covered
    const cocoaCard = within(wishlistSection).getByRole('article', {
      name: /hot cocoa thermos/i,
    });
    expect(within(cocoaCard).getByText('1 of 1 claimed')).toBeInTheDocument();
    expect(within(cocoaCard).getByText(/covered/i)).toBeInTheDocument();
    expect(within(cocoaCard).getByText('Alex Rivera')).toBeInTheDocument();
    expect(within(cocoaCard).getByText(/Bringing oat milk option too/i)).toBeInTheDocument();

    // Gear / First Aid item: 0 of 2 claimed, 2 needed
    const warmersCard = within(wishlistSection).getByRole('article', {
      name: /hand warmers \(bulk pack\)/i,
    });
    expect(within(warmersCard).getByText('0 of 2 claimed')).toBeInTheDocument();
    expect(within(warmersCard).getByText(/2 needed/i)).toBeInTheDocument();
  });

  it('lets a Participant one-tap claim an open wish-list Supply with or without an optional note and unclaim only their own claims', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, participantApi, maya, samir } = await createSuppliesFixture();

    const broth = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Broth Jug',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });

    const blankets = await organizerApi.createSupplyItem(eventId, {
      category: 'gear_first_aid',
      name: 'Extra Fleece Blankets',
      isWishlist: true,
      targetSlots: 1,
      createdByParticipantId: null,
    });

    // Samir already claimed 1 slot of Hot Broth Jug
    const samirClaim = await participantApi.createSupplyClaim(eventId, {
      supplyItemId: broth.id,
      participantId: samir.id,
      note: 'Chicken & veggie',
    });

    saveParticipantId(eventId, maya.id);
    render(<App eventApi={participantApi} />);
    await openSuppliesTab(user);

    const brothCard = screen.getByRole('article', { name: /hot broth jug/i });
    const blanketsCard = screen.getByRole('article', { name: /extra fleece blankets/i });

    // Honor-system guardrail: Maya cannot unclaim Samir's claim
    expect(within(brothCard).getByText('Samir Patel')).toBeInTheDocument();
    expect(within(brothCard).queryByRole('button', { name: /unclaim/i })).not.toBeInTheDocument();

    // Claiming Hot Broth Jug WITH an optional note fills the 2nd of 2 slots -> Covered
    const brothNoteInput = within(brothCard).getByLabelText(/optional note for hot broth jug/i);
    await user.type(brothNoteInput, 'Bringing miso broth');
    const claimBrothButton = within(brothCard).getByRole('button', { name: /^claim$/i });
    expect(claimBrothButton.className).toContain('min-h-[44px]');
    await user.click(claimBrothButton);

    expect(await within(brothCard).findByText('2 of 2 claimed')).toBeInTheDocument();
    expect(within(brothCard).getByText(/covered/i)).toBeInTheDocument();
    expect(within(brothCard).getByText('Maya Chen')).toBeInTheDocument();
    expect(within(brothCard).getByText(/Bringing miso broth/i)).toBeInTheDocument();
    // No more open slots -> claim button hidden
    expect(within(brothCard).queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument();

    // One-tap claim Extra Fleece Blankets WITHOUT typing a note
    await user.click(within(blanketsCard).getByRole('button', { name: /^claim$/i }));
    expect(await within(blanketsCard).findByText('1 of 1 claimed')).toBeInTheDocument();
    expect(within(blanketsCard).getByText(/covered/i)).toBeInTheDocument();
    expect(within(blanketsCard).getByText('Maya Chen')).toBeInTheDocument();

    // Verify persisted in EventApi
    let snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.supplyClaims.filter((c) => c.supplyItemId === broth.id)).toHaveLength(2);
    expect(snap.supplyClaims.filter((c) => c.supplyItemId === blankets.id)).toMatchObject([
      { participantId: maya.id, note: null },
    ]);

    // Maya sees Unclaim ONLY on her own claim (1 unclaim button on brothCard, not Samir's)
    const unclaimButtons = within(brothCard).getAllByRole('button', { name: /unclaim/i });
    expect(unclaimButtons).toHaveLength(1);
    expect(unclaimButtons[0].className).toContain('min-h-[44px]');
    await user.click(unclaimButtons[0]);

    // Drops back to 1 of 2 claimed, 1 needed, Samir's claim untouched, Claim button returns
    expect(await within(brothCard).findByText('1 of 2 claimed')).toBeInTheDocument();
    expect(within(brothCard).getByText(/1 needed/i)).toBeInTheDocument();
    expect(within(brothCard).getByText('Samir Patel')).toBeInTheDocument();
    expect(within(brothCard).queryByText('Maya Chen')).not.toBeInTheDocument();
    expect(within(brothCard).getByRole('button', { name: /^claim$/i })).toBeInTheDocument();

    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.supplyClaims.filter((c) => c.supplyItemId === broth.id)).toEqual([
      expect.objectContaining({ id: samirClaim.id, participantId: samir.id }),
    ]);
  });

  it('lets a Participant add, edit, and delete their own volunteered Supplies while hiding edit/delete on other Participants entries', async () => {
    const user = userEvent.setup();
    const { eventId, participantApi, maya, samir } = await createSuppliesFixture();

    // Samir already volunteered an item
    const samirItem = await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Cinnamon Rolls',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: samir.id,
    });

    saveParticipantId(eventId, maya.id);
    render(<App eventApi={participantApi} />);
    await openSuppliesTab(user);

    const volunteeredSection = screen.getByRole('region', { name: /volunteered supplies/i });

    // Samir's volunteered item is visible, attributed to Samir, and has NO Edit/Delete buttons for Maya
    const samirCard = within(volunteeredSection).getByRole('article', {
      name: /cinnamon rolls/i,
    });
    expect(within(samirCard).getByText('Food')).toBeInTheDocument();
    expect(within(samirCard).getByText(/Samir Patel/i)).toBeInTheDocument();
    expect(within(samirCard).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(within(samirCard).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    // Validation: rejects blank volunteered item name
    const addButton = within(volunteeredSection).getByRole('button', { name: /add supply/i });
    expect(addButton.className).toContain('min-h-[44px]');
    await user.click(addButton);
    expect(await within(volunteeredSection).findByRole('alert')).toHaveTextContent(
      /enter a supply name/i,
    );

    // Maya adds a volunteered Supply (name + category)
    const nameInput = within(volunteeredSection).getByLabelText(/supply name/i);
    const categorySelect = within(volunteeredSection).getByLabelText(/category/i);
    await user.type(nameInput, 'Electric Kettle');
    await user.selectOptions(categorySelect, 'gear_first_aid');
    await user.click(addButton);

    const mayaCard = await within(volunteeredSection).findByRole('article', {
      name: /electric kettle/i,
    });
    expect(within(mayaCard).getByText('Gear / First Aid')).toBeInTheDocument();
    expect(within(mayaCard).getByText(/Maya Chen/i)).toBeInTheDocument();

    // Verify persisted with isWishlist: false and createdByParticipantId: maya.id
    let snap = await participantApi.getEventSnapshot(eventId);
    const createdItem = snap.supplyItems.find((item) => item.name === 'Electric Kettle');
    expect(createdItem).toMatchObject({
      category: 'gear_first_aid',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: maya.id,
    });

    // Maya edits her own volunteered Supply (name + category)
    const editButton = within(mayaCard).getByRole('button', { name: /edit/i });
    expect(editButton.className).toContain('min-h-[44px]');
    await user.click(editButton);

    const editNameInput = within(mayaCard).getByLabelText(/edit supply name/i);
    const editCategorySelect = within(mayaCard).getByLabelText(/edit category/i);
    await user.clear(editNameInput);
    await user.type(editNameInput, 'Spiced Apple Cider Jug');
    await user.selectOptions(editCategorySelect, 'drinks');
    await user.click(within(mayaCard).getByRole('button', { name: /^save$/i }));

    const updatedCard = await within(volunteeredSection).findByRole('article', {
      name: /spiced apple cider jug/i,
    });
    expect(within(updatedCard).getByText('Drinks')).toBeInTheDocument();

    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.supplyItems.find((item) => item.id === createdItem?.id)).toMatchObject({
      name: 'Spiced Apple Cider Jug',
      category: 'drinks',
      isWishlist: false,
    });

    // Maya deletes her own volunteered Supply; Samir's remains intact
    const deleteButton = within(updatedCard).getByRole('button', { name: /delete/i });
    expect(deleteButton.className).toContain('min-h-[44px]');
    await user.click(deleteButton);

    expect(
      within(volunteeredSection).queryByRole('article', { name: /spiced apple cider jug/i }),
    ).not.toBeInTheDocument();
    expect(
      within(volunteeredSection).getByRole('article', { name: /cinnamon rolls/i }),
    ).toBeInTheDocument();

    snap = await participantApi.getEventSnapshot(eventId);
    expect(snap.supplyItems.map((i) => i.id)).toEqual([samirItem.id]);
  });

  it('disables Supply claim, unclaim, and volunteered Supply mutations with a Requires connection state when offline', async () => {
    const user = userEvent.setup();
    const { eventId, organizerApi, participantApi, maya } = await createSuppliesFixture();

    const cocoa = await organizerApi.createSupplyItem(eventId, {
      category: 'drinks',
      name: 'Hot Cocoa Thermos',
      isWishlist: true,
      targetSlots: 2,
      createdByParticipantId: null,
    });
    await participantApi.createSupplyClaim(eventId, {
      supplyItemId: cocoa.id,
      participantId: maya.id,
      note: null,
    });
    await participantApi.createSupplyItem(eventId, {
      category: 'food',
      name: 'Energy Bites',
      isWishlist: false,
      targetSlots: null,
      createdByParticipantId: maya.id,
    });

    saveParticipantId(eventId, maya.id);
    render(<App eventApi={participantApi} />);
    await openSuppliesTab(user);

    // Simulate going offline
    const { act } = await import('@testing-library/react');
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    const cocoaCard = screen.getByRole('article', { name: /hot cocoa thermos/i });
    const offlineButtons = within(cocoaCard).getAllByRole('button', {
      name: /requires connection/i,
    });
    expect(offlineButtons).toHaveLength(2); // Unclaim + Claim
    for (const button of offlineButtons) {
      expect(button).toBeDisabled();
    }

    const volunteeredSection = screen.getByRole('region', { name: /volunteered supplies/i });
    const volunteeredOfflineButtons = within(volunteeredSection).getAllByRole('button', {
      name: /requires connection/i,
    });
    expect(volunteeredOfflineButtons).toHaveLength(2); // Add Supply + Edit
    for (const button of volunteeredOfflineButtons) {
      expect(button).toBeDisabled();
    }

    const energyCard = within(volunteeredSection).getByRole('article', { name: /energy bites/i });
    const editBtn = within(energyCard).getByRole('button', { name: /requires connection/i });
    const deleteBtn = within(energyCard).getByRole('button', { name: /delete/i });
    expect(editBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();
  });
});
