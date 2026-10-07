import { Anchor, BedDouble, Flashlight, LifeBuoy, Package, ShieldPlus, Ship, Truck, Waves, type LucideIcon } from 'lucide-react';

export const EQUIPMENT_ICONS: Record<string, LucideIcon> = {
  boat: Ship,
  life_jacket: LifeBuoy,
  truck6: Truck,
  highclear: Truck,
  swift_kit: Waves,
  medic_kit: ShieldPlus,
  stretcher: BedDouble,
  food_pack: Package,
  light: Flashlight,
};

export const FALLBACK_ICON = Anchor;
