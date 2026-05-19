export interface ForecastResult {
  itemId: string;
  itemName: string;
  currentQuantity: number;
  averageDailyUsage: number;
  predictedWeeklyDemand: number;
  recommendedRestock: number;
  lowRisk: boolean;
}

export type AvailabilityLabel = 'Unavailable' | 'At Risk' | 'Limited' | 'Available';

export interface AiAvailabilityInsight {
  itemId: string;
  itemName: string;
  currentQuantity: number;
  averageDailyUsage: number;
  predictedWeeklyDemand: number;
  recommendedRestock: number;
  confidenceScore: number;
  availabilityLabel: AvailabilityLabel;
  message: string;
}
