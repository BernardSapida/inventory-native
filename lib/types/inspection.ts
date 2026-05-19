export type InspectionCondition = 'good' | 'warning' | 'damaged' | 'expired';

export interface InspectionModel {
  id: string;
  itemName: string;
  condition: InspectionCondition;
  notes: string;
  staffId: string;
  staffName?: string;
  checkedAt?: Date;
}
