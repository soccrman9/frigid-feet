import type { SupplyCategory, SupplyItem } from '../../types/domain';

export interface SupplyCategoryOption {
  value: SupplyCategory;
  label: string;
}

export const SUPPLY_CATEGORIES: ReadonlyArray<SupplyCategoryOption> = [
  { value: 'food', label: 'Food' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'gear_first_aid', label: 'Gear / First Aid' },
];

export function getSupplyCategoryLabel(category: SupplyCategory): string {
  return SUPPLY_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

export interface WishlistSlotStatus {
  claimedCount: number;
  targetSlots: number | null;
  remainingSlots: number | null;
  isCovered: boolean;
  slotSummary: string;
  stateLabel: string;
}

export function getWishlistSlotStatus(
  item: Pick<SupplyItem, 'targetSlots'>,
  claimedCount: number,
): WishlistSlotStatus {
  const targetSlots = item.targetSlots;

  if (targetSlots === null) {
    return {
      claimedCount,
      targetSlots: null,
      remainingSlots: null,
      isCovered: false,
      slotSummary: `${claimedCount} claimed`,
      stateLabel: 'Open',
    };
  }

  const remainingSlots = Math.max(0, targetSlots - claimedCount);
  const isCovered = remainingSlots === 0;

  return {
    claimedCount,
    targetSlots,
    remainingSlots,
    isCovered,
    slotSummary: `${claimedCount} of ${targetSlots} claimed`,
    stateLabel: isCovered ? 'Covered' : `${remainingSlots} needed`,
  };
}
