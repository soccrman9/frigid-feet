import { useCallback, useMemo } from 'react';
import type { SupplyCategory } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { DietarySummaryBanner } from './DietarySummaryBanner';
import { WishlistSuppliesSection } from './WishlistSuppliesSection';
import { VolunteeredSuppliesSection } from './VolunteeredSuppliesSection';

export function SuppliesTab() {
  const { eventApi, eventId, snapshot, activeParticipant, isOrganizer, isOnline, setSnapshot } =
    useEventData();

  const participantsById = useMemo(
    () => new Map(snapshot.participants.map((participant) => [participant.id, participant])),
    [snapshot.participants],
  );

  const wishlistItems = useMemo(
    () => snapshot.supplyItems.filter((item) => item.isWishlist),
    [snapshot.supplyItems],
  );

  const volunteeredItems = useMemo(
    () => snapshot.supplyItems.filter((item) => !item.isWishlist),
    [snapshot.supplyItems],
  );

  const handleClaimWishlistItem = useCallback(
    async (supplyItemId: string, note: string | null) => {
      if (!activeParticipant) return;
      const createdClaim = await eventApi.createSupplyClaim(eventId, {
        supplyItemId,
        participantId: activeParticipant.id,
        note,
      });
      setSnapshot((prev) => ({
        ...prev,
        supplyClaims: [...prev.supplyClaims, createdClaim],
      }));
    },
    [activeParticipant, eventApi, eventId, setSnapshot],
  );

  const handleUnclaimWishlistItem = useCallback(
    async (supplyClaimId: string) => {
      await eventApi.deleteSupplyClaim(eventId, supplyClaimId);
      setSnapshot((prev) => ({
        ...prev,
        supplyClaims: prev.supplyClaims.filter((claim) => claim.id !== supplyClaimId),
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  const handleAddVolunteeredItem = useCallback(
    async (name: string, category: SupplyCategory) => {
      if (!activeParticipant) return;
      const createdItem = await eventApi.createSupplyItem(eventId, {
        category,
        name,
        isWishlist: false,
        targetSlots: null,
        createdByParticipantId: activeParticipant.id,
      });
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: [...prev.supplyItems, createdItem],
      }));
    },
    [activeParticipant, eventApi, eventId, setSnapshot],
  );

  const handleUpdateVolunteeredItem = useCallback(
    async (supplyItemId: string, name: string, category: SupplyCategory) => {
      const updatedItem = await eventApi.updateSupplyItem(eventId, supplyItemId, {
        name,
        category,
      });
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: prev.supplyItems.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  const handleDeleteVolunteeredItem = useCallback(
    async (supplyItemId: string) => {
      await eventApi.deleteSupplyItem(eventId, supplyItemId);
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: prev.supplyItems.filter((item) => item.id !== supplyItemId),
        supplyClaims: prev.supplyClaims.filter((claim) => claim.supplyItemId !== supplyItemId),
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  const handleCreateWishlistItem = useCallback(
    async (name: string, category: SupplyCategory, targetSlots: number) => {
      const createdItem = await eventApi.createSupplyItem(eventId, {
        category,
        name,
        isWishlist: true,
        targetSlots,
        createdByParticipantId: null,
      });
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: [...prev.supplyItems, createdItem],
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  const handleUpdateWishlistItem = useCallback(
    async (
      supplyItemId: string,
      name: string,
      category: SupplyCategory,
      targetSlots: number,
    ) => {
      const updatedItem = await eventApi.updateSupplyItem(eventId, supplyItemId, {
        name,
        category,
        targetSlots,
      });
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: prev.supplyItems.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  const handleDeleteWishlistItem = useCallback(
    async (supplyItemId: string) => {
      await eventApi.deleteSupplyItem(eventId, supplyItemId);
      setSnapshot((prev) => ({
        ...prev,
        supplyItems: prev.supplyItems.filter((item) => item.id !== supplyItemId),
        supplyClaims: prev.supplyClaims.filter((claim) => claim.supplyItemId !== supplyItemId),
      }));
    },
    [eventApi, eventId, setSnapshot],
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 pb-6">
      <section
        className="rounded-md border-[1.5px] p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <p
          className="text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Basecamp Coordination
        </p>
        <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
          Supplies
        </h1>
        <p className="mt-1 text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>
          {wishlistItems.length} wish-list · {snapshot.supplyClaims.length} claimed ·{' '}
          {volunteeredItems.length} volunteered
        </p>
      </section>

      <DietarySummaryBanner participants={snapshot.participants} />

      <WishlistSuppliesSection
        items={wishlistItems}
        claims={snapshot.supplyClaims}
        participantsById={participantsById}
        activeParticipant={activeParticipant}
        isOrganizer={isOrganizer}
        isOnline={isOnline}
        onClaim={handleClaimWishlistItem}
        onUnclaim={handleUnclaimWishlistItem}
        onCreateItem={handleCreateWishlistItem}
        onUpdateItem={handleUpdateWishlistItem}
        onDeleteItem={handleDeleteWishlistItem}
      />

      <VolunteeredSuppliesSection
        items={volunteeredItems}
        participantsById={participantsById}
        activeParticipant={activeParticipant}
        isOrganizer={isOrganizer}
        isOnline={isOnline}
        onAdd={handleAddVolunteeredItem}
        onUpdate={handleUpdateVolunteeredItem}
        onDelete={handleDeleteVolunteeredItem}
      />
    </div>
  );
}
