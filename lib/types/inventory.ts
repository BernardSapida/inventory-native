export type ItemStatus = 'ok' | 'low' | 'out';

export type ItemCategory =
  | 'Dairy'
  | 'Produce'
  | 'Protein'
  | 'Dry Goods'
  | 'Seasonings'
  | 'General';

export const ITEM_CATEGORIES: ItemCategory[] = [
  'Dairy',
  'Produce',
  'Protein',
  'Dry Goods',
  'Seasonings',
  'General',
];

export const ITEM_UNITS = ['pcs', 'g', 'ml', 'L', 'kg', 'oz', 'lb', 'cup', 'tbsp', 'tsp'];

export interface FirestoreInventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  unit: string;
  quantity: number;
  minimumThreshold: number;
  expirationDate?: Date;
  barcode: string;
  countable?: boolean;
  status: ItemStatus;
  createdAt?: Date;
  updatedAt?: Date;
  updatedBy: string;
}

export function computeStatus(quantity: number, threshold: number): ItemStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= threshold) return 'low';
  return 'ok';
}
