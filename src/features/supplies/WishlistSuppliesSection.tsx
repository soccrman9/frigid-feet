import { useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Coffee,
  Hand,
  ShieldPlus,
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

interface WishlistSuppliesSectionProps {
  items: SupplyItem[];
  claims: SupplyClaim[];
  participantsById: ReadonlyMap<string, Participant>;
  activeParticipant: Participant | null;
  isOnline: boolean;
  onClaim: (supplyItemId: string, note: string | null) => Promise<void>;
  onUnclaim: (supplyClaimId: string) => Promise<void>;
}

export function WishlistSuppliesSection({
  items,
  claims,
  participantsById,
  activeParticipant,
  isOnline,
  onClaim,
  onUnclaim,
}: WishlistSuppliesSectionProps) {
  const [noteByItemId, setNoteByItemId] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  async function handleUnclaim(claim: SupplyClaim, itemName: string) {
    if (!activeParticipant || claim.participantId !== activeParticipant.id) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to unclaim a Supply.');
      return;
    }

    setBusyClaimId(claim.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onUnclaim(claim.id);
      setStatusMessage(`Unclaimed ${itemName}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not unclaim that Supply. Please try again.',
      );
    } finally {
      setBusyClaimId(null);
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
      </div>

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
                  const isBusyClaiming = busyItemId === item.id;

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

                                {isOwnClaim && (
                                  <button
                                    type="button"
                                    disabled={isBusyUnclaiming || !isOnline}
                                    onClick={() => void handleUnclaim(claim, item.name)}
                                    className="pfl-focus-ring inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                    style={{
                                      backgroundColor: 'var(--bg-ground)',
                                      borderColor: 'var(--border-strong)',
                                      color: 'var(--ink-primary)',
                                    }}
                                  >
                                    <Undo2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                    <span>
                                      {!isOnline
                                        ? 'Requires connection'
                                        : isBusyUnclaiming
                                          ? 'Unclaiming…'
                                          : 'Unclaim'}
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
                            disabled={isBusyClaiming || !isOnline}
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
                            disabled={isBusyClaiming || !isOnline}
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
                                : isBusyClaiming
                                  ? 'Claiming…'
                                  : 'Claim'}
                            </span>
                          </button>
                        </form>
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
