import { Coffee, ShieldPlus, UtensilsCrossed } from 'lucide-react';
import type { SupplyCategory } from '../../types/domain';

export interface SupplyCategoryIconProps {
  category: SupplyCategory;
  size?: number;
}

export function SupplyCategoryIcon({ category, size = 15 }: SupplyCategoryIconProps) {
  switch (category) {
    case 'food':
      return <UtensilsCrossed size={size} strokeWidth={2.2} aria-hidden="true" />;
    case 'drinks':
      return <Coffee size={size} strokeWidth={2.2} aria-hidden="true" />;
    case 'gear_first_aid':
      return <ShieldPlus size={size} strokeWidth={2.2} aria-hidden="true" />;
  }
}
