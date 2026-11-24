import { useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Coffee,
  Hand,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Undo2,
  UtensilsCrossed,
} from 'lucide-react';
import type { Participant, SupplyCategory, SupplyClaim, SupplyItem } from '../../types/domain';
import { getWishlistSlotStatus, SUPPLY_CATEGORIES } from './supplyConstants';

function CategoryIcon({ category }: { category: SupplyCategory }) {
  switch (category) {
    case 'food':
      return <UtensilsCrossed size={15} strokeWidth={2.2} aria-hidden="true" />;
    case 'drinks':
      return <Coffee size={15} strokeWidth={2.2} aria-hidden="true" />;
    case 'gear_first_aid':
      return <ShieldPlus size={15} strokeWidth={2.2} aria-hidden="true" />;
  }
}

function parseTargetSlots(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

interface WishlistSuppliesSectionProps {
  items: SupplyItem[];
  claims: SupplyClaim[];
  participantsById: ReadonlyMap<string, Participant>;
  activeParticipant: Participant | null;
  isOrganizer?: boolean;
  isOnline: boolean;
  onClaim: (supplyItemId: string, note: string | null) => Promise<void>;
  onUnclaim: (supplyClaimId: string) => Promise<void>;
  onCreateItem?: (name: string, category: SupplyCategory, targetSlots: number) => Promise<void>;
  onUpdateItem?: (
    supplyItemId: string,
    name: string,
    category: SupplyCategory,
    targetSlots: number,
  ) => Promise<void>;
  onDeleteItem?: (supplyItemId: string) => Promise<void>;
}

export function WishlistSuppliesSection({
  items,
  claims,
  participantsById,
  activeParticipant,
  isOrganizer = false,
  isOnline,
  onClaim,
  onUnclaim,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
}: WishlistSuppliesSectionProps) {
  const [noteByItemId, setNoteByItemId] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Organizer create wish-list item state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<SupplyCategory>('food');
  const [newTargetSlots, setNewTargetSlots] = useState('1');
  const [creating, setCreating] = useState(false);

  // Organizer edit wish-list item state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<SupplyCategory>('food');
  const [editTargetSlots, setEditTargetSlots] = useState('1');

  const claimsByItemId = new Map<string, SupplyClaim[]>();
  for (const claim of claims) {
    const existing = claimsByItemId.get(claim.supplyItemId);
    if (existing) {
      existing.push(claim);
    } else {
      claimsByItemId.set(claim.supplyItemId, [claim]);
    }
  }

  const groupedCategories = SUPPLY_CATEGORIES.map((categoryOption) => ({
    ...categoryOption,
    items: items.filter((item) => item.category === categoryOption.value),
  })).filter((group) => group.items.length > 0);

  async function handleClaimSubmit(
    formEvent: FormEvent<HTMLFormElement>,
    item: SupplyItem,
  ) {
    formEvent.preventDefault();
    if (!activeParticipant) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to claim a Supply.');
      return;
    }

    const rawNote = noteByItemId[item.id] ?? '';
    const trimmedNote = rawNote.trim();

    setBusyItemId(item.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onClaim(item.id, trimmedNote.length > 0 ? trimmedNote : null);
      setNoteByItemId((prev) => ({ ...prev, [item.id]: '' }));
      setStatusMessage(`Claimed ${item.name}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not claim that Supply. Please try again.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleUnclaim(claim: SupplyClaim, itemName: string, claimerName: string) {
    const isOwnClaim = activeParticipant !== null && claim.participantId === activeParticipant.id;
    if (!isOwnClaim && !isOrganizer) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to remove a Supply claim.');
      return;
    }

    setBusyClaimId(claim.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onUnclaim(claim.id);
      setStatusMessage(
        isOwnClaim
          ? `Unclaimed ${itemName}.`
          : `Removed ${claimerName}'s claim on ${itemName}.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not remove that Supply claim. Please try again.',
      );
    } finally {
      setBusyClaimId(null);
    }
  }

  async function handleCreateWishlistSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOrganizer || !onCreateItem) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to add a wish-list Supply.');
      return;
    }

    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setErrorMessage('Please enter a Supply name before adding to the wish list.');
      setStatusMessage(null);
      return;
    }

    const parsedSlots = parseTargetSlots(newTargetSlots);
    if (parsedSlots === null) {
      setErrorMessage('Target slots must be a whole number of at least 1.');
      setStatusMessage(null);
      return;
    }

    setCreating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onCreateItem(trimmed, newCategory, parsedSlots);
      setNewName('');
      setNewTargetSlots('1');
      setStatusMessage(`Added "${trimmed}" to the Basecamp wish list.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not add wish-list Supply. Please try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  function startEditingItem(item: SupplyItem) {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditTargetSlots(String(item.targetSlots ?? 1));
    setErrorMessage(null);
    setStatusMessage(null);
  }

  function cancelEditingItem() {
    setEditingItemId(null);
    setEditName('');
    setErrorMessage(null);
  }

  async function handleEditWishlistSubmit(
    formEvent: FormEvent<HTMLFormElement>,
    item: SupplyItem,
  ) {
    formEvent.preventDefault();
    if (!isOrganizer || !onUpdateItem) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to edit a wish-list Supply.');
      return;
    }

    const trimmed = editName.trim();
    if (trimmed.length === 0) {
      setErrorMessage('Please enter a Supply name before saving.');
      return;
    }

    const parsedSlots = parseTargetSlots(editTargetSlots);
    if (parsedSlots === null) {
      setErrorMessage('Target slots must be a whole number of at least 1.');
      return;
    }

    setBusyItemId(item.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onUpdateItem(item.id, trimmed, editCategory, parsedSlots);
      setEditingItemId(null);
      setStatusMessage(`Updated wish-list Supply "${trimmed}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not update wish-list Supply.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDeleteWishlistItem(item: SupplyItem) {
    if (!isOrganizer || !onDeleteItem) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to delete a wish-list Supply.');
      return;
    }

    setBusyItemId(item.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onDeleteItem(item.id);
      if (editingItemId === item.id) {
        setEditingItemId(null);
      }
      setStatusMessage(`Deleted "${item.name}" from the wish list.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not delete wish-list Supply.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <section
      aria-labelledby="wishlist-supplies-heading"
      className="rounded-md border-[1.5px] p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p
            className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <ClipboardList size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>Organizer Wish List</span>
          </p>
          <h2
            id="wishlist-supplies-heading"
            className="mt-0.5 text-lg font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            Basecamp Wish List
          </h2>
        </div>

        {isOrganizer && (
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--accent-amber-soft)',
              borderColor: 'var(--accent-amber)',
              color: 'var(--accent-amber-ink)',
            }}
          >
            <ShieldCheck size={13} strokeWidth={2.4} aria-hidden="true" />
            <span>Organizer Controls</span>
          </span>
        )}
      </div>

      {isOrganizer && onCreateItem && (
        <form
          onSubmit={(e) => void handleCreateWishlistSubmit(e)}
          className="mt-3 flex flex-col gap-2.5 rounded-md border-[1.5px] p-3"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--accent-amber)',
          }}
          noValidate
        >
          <p
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Add Wish-List Supply
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto_110px]">
            <div>
              <label
                htmlFor="wishlist-supply-name"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Wish-list Supply name
              </label>
              <input
                id="wishlist-supply-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={creating || !isOnline}
                placeholder="e.g. Hand Warmers (bulk pack)"
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="wishlist-supply-category"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Wish-list category
              </label>
              <select
                id="wishlist-supply-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as SupplyCategory)}
                disabled={creating || !isOnline}
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                {SUPPLY_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="wishlist-supply-slots"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Target slots
              </label>
              <input
                id="wishlist-supply-slots"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={newTargetSlots}
                onChange={(e) => {
                  setNewTargetSlots(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={creating || !isOnline}
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-bold tabular-nums disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || !isOnline}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span>
              {!isOnline
                ? 'Requires connection'
                : creating
                  ? 'Adding…'
                  : 'Add Wish-List Supply'}
            </span>
          </button>
        </form>
      )}

      {statusMessage && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
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

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-error-bg)',
            borderColor: 'var(--accent-error-border)',
            color: 'var(--accent-error)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {groupedCategories.length === 0 ? (
        <p
          className="mt-3 rounded-md border px-3 py-3 text-sm"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-hairline)',
            color: 'var(--ink-secondary)',
          }}
        >
          No wish-list Supplies posted by the Organizer yet. Check back soon or volunteer an item
          below.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groupedCategories.map((group) => (
            <div key={group.value} className="flex flex-col gap-2">
              <h3
                className="flex items-center gap-1.5 border-b pb-1.5 text-xs font-bold tracking-wider uppercase"
                style={{
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <CategoryIcon category={group.value} />
                <span>{group.label}</span>
              </h3>

              <div className="flex flex-col gap-2.5">
                {group.items.map((item) => {
                  const itemClaims = claimsByItemId.get(item.id) ?? [];
                  const slotStatus = getWishlistSlotStatus(item, itemClaims.length);
                  const headingId = `wishlist-item-${item.id}`;
                  const isBusyItem = busyItemId === item.id;
                  const isEditing = isOrganizer && editingItemId === item.id;

                  return (
                    <article
                      key={item.id}
                      aria-labelledby={headingId}
                      className="rounded-md border-[1.5px] p-3"
                      style={{
                        backgroundColor: slotStatus.isCovered
                          ? 'var(--bg-rail-subtle)'
                          : 'var(--bg-ground)',
                        borderColor: slotStatus.isCovered
                          ? 'var(--accent-spruce)'
                          : 'var(--border-structural)',
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => void handleEditWishlistSubmit(e, item)}
                          className="flex flex-col gap-2.5"
                          noValidate
                        >
                          <h4 id={headingId} className="sr-only">
                            {item.name}
                          </h4>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_100px]">
                            <div>
                              <label
                                htmlFor={`edit-wishlist-name-${item.id}`}
                                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                Edit wish-list Supply name
                              </label>
                              <input
                                id={`edit-wishlist-name-${item.id}`}
                                type="text"
                                value={editName}
                                onChange={(e) => {
                                  setEditName(e.target.value);
                                  if (errorMessage) setErrorMessage(null);
                                }}
                                disabled={isBusyItem || !isOnline}
                                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-strong)',
                                  color: 'var(--ink-primary)',
                                }}
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`edit-wishlist-category-${item.id}`}
                                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                Edit wish-list category
                              </label>
                              <select
                                id={`edit-wishlist-category-${item.id}`}
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value as SupplyCategory)}
                                disabled={isBusyItem || !isOnline}
                                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-strong)',
                                  color: 'var(--ink-primary)',
                                }}
                              >
                                {SUPPLY_CATEGORIES.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label
                                htmlFor={`edit-wishlist-slots-${item.id}`}
                                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                Edit target slots
                              </label>
                              <input
                                id={`edit-wishlist-slots-${item.id}`}
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                value={editTargetSlots}
                                onChange={(e) => {
                                  setEditTargetSlots(e.target.value);
                                  if (errorMessage) setErrorMessage(null);
                                }}
                                disabled={isBusyItem || !isOnline}
                                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-bold tabular-nums"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-strong)',
                                  color: 'var(--ink-primary)',
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={isBusyItem || !isOnline}
                              className="pfl-focus-ring min-h-[44px] flex-1 cursor-pointer rounded-md border-0 px-3 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                              style={{
                                backgroundColor: 'var(--accent-amber-cta)',
                                color: '#0C1E30',
                              }}
                            >
                              {!isOnline ? 'Requires connection' : isBusyItem ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusyItem}
                              onClick={cancelEditingItem}
                              className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-sm font-bold"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--border-strong)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h4
                              id={headingId}
                              className="text-base font-bold leading-snug"
                              style={{ color: 'var(--ink-primary)' }}
                            >
                              {item.name}
                            </h4>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold tabular-nums"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-structural)',
                                  color: 'var(--ink-primary)',
                                }}
                              >
                                {slotStatus.slotSummary}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold tabular-nums"
                                style={{
                                  backgroundColor: slotStatus.isCovered
                                    ? 'var(--accent-spruce-soft)'
                                    : 'var(--accent-amber-soft)',
                                  borderColor: slotStatus.isCovered
                                    ? 'var(--accent-spruce)'
                                    : 'var(--accent-amber)',
                                  color: slotStatus.isCovered
                                    ? 'var(--accent-spruce)'
                                    : 'var(--accent-amber-ink)',
                                }}
                              >
                                {slotStatus.isCovered ? (
                                  <CheckCircle2 size={13} strokeWidth={2.3} aria-hidden="true" />
                                ) : (
                                  <CircleDashed size={13} strokeWidth={2.3} aria-hidden="true" />
                                )}
                                <span>{slotStatus.stateLabel}</span>
                              </span>
                            </div>
                          </div>

                          {isOrganizer && (onUpdateItem || onDeleteItem) && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {onUpdateItem && (
                                <button
                                  type="button"
                                  disabled={isBusyItem || !isOnline}
                                  onClick={() => startEditingItem(item)}
                                  className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-strong)',
                                    color: 'var(--ink-primary)',
                                  }}
                                >
                                  <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                                  <span>Edit</span>
                                </button>
                              )}
                              {onDeleteItem && (
                                <button
                                  type="button"
                                  disabled={isBusyItem || !isOnline}
                                  onClick={() => void handleDeleteWishlistItem(item)}
                                  className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-strong)',
                                    color: 'var(--ink-primary)',
                                  }}
                                >
                                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                  <span>{isBusyItem ? 'Deleting…' : 'Delete'}</span>
                                </button>
                              )}
                            </div>
                          )}

                          {itemClaims.length > 0 && (
                            <ul
                              className="mt-2.5 divide-y rounded-md border"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--border-hairline)',
                              }}
                            >
                              {itemClaims.map((claim) => {
                                const claimerName =
                                  participantsById.get(claim.participantId)?.displayName ??
                                  'Participant';
                                const note = claim.note?.trim() ?? '';
                                const isOwnClaim =
                                  activeParticipant !== null &&
                                  claim.participantId === activeParticipant.id;
                                const canRemoveClaim = isOwnClaim || isOrganizer;
                                const isBusyUnclaiming = busyClaimId === claim.id;

                                return (
                                  <li
                                    key={claim.id}
                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                                    style={{ borderColor: 'var(--border-hairline)' }}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span
                                        className="font-bold"
                                        style={{ color: 'var(--ink-primary)' }}
                                      >
                                        {claimerName}
                                      </span>
                                      {note.length > 0 && (
                                        <span
                                          className="ml-1.5 text-xs font-medium"
                                          style={{ color: 'var(--ink-muted)' }}
                                        >
                                          — {note}
                                        </span>
                                      )}
                                    </div>

                                    {canRemoveClaim && (
                                      <button
                                        type="button"
                                        disabled={isBusyUnclaiming || !isOnline}
                                        aria-label={
                                          isOwnClaim
                                            ? undefined
                                            : `Remove ${claimerName}'s claim on ${item.name}`
                                        }
                                        onClick={() =>
                                          void handleUnclaim(claim, item.name, claimerName)
                                        }
                                        className="pfl-focus-ring inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                        style={{
                                          backgroundColor: 'var(--bg-ground)',
                                          borderColor: 'var(--border-strong)',
                                          color: 'var(--ink-primary)',
                                        }}
                                      >
                                        {isOwnClaim ? (
                                          <Undo2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                        ) : (
                                          <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                        )}
                                        <span>
                                          {!isOnline
                                            ? 'Requires connection'
                                            : isBusyUnclaiming
                                              ? isOwnClaim
                                                ? 'Unclaiming…'
                                                : 'Removing…'
                                              : isOwnClaim
                                                ? 'Unclaim'
                                                : 'Remove'}
                                        </span>
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {!slotStatus.isCovered && activeParticipant && (
                            <form
                              onSubmit={(e) => void handleClaimSubmit(e, item)}
                              className="mt-2.5 flex flex-wrap items-stretch gap-2"
                            >
                              <input
                                type="text"
                                aria-label={`Optional note for ${item.name}`}
                                value={noteByItemId[item.id] ?? ''}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setNoteByItemId((prev) => ({ ...prev, [item.id]: nextValue }));
                                }}
                                disabled={isBusyItem || !isOnline}
                                placeholder="Optional note (e.g. bringing 2)"
                                className="pfl-focus-ring min-h-[44px] min-w-[180px] flex-1 rounded-md border-[1.5px] px-3 text-sm font-medium disabled:opacity-60"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-strong)',
                                  color: 'var(--ink-primary)',
                                }}
                              />
                              <button
                                type="submit"
                                disabled={isBusyItem || !isOnline}
                                className="pfl-focus-ring inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                style={{
                                  backgroundColor: 'var(--accent-amber-cta)',
                                  color: '#0C1E30',
                                }}
                              >
                                <Hand size={15} strokeWidth={2.3} aria-hidden="true" />
                                <span>
                                  {!isOnline
                                    ? 'Requires connection'
                                    : isBusyItem
                                      ? 'Claiming…'
                                      : 'Claim'}
                                </span>
                              </button>
                            </form>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
