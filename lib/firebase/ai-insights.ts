import { generateWeeklyForecast } from './forecasting';
import { AiAvailabilityInsight, AvailabilityLabel } from '@/lib/types/forecast';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function getLabel(current: number, predicted: number): AvailabilityLabel {
  if (current <= 0) return 'Unavailable';
  if (predicted > 0 && current / predicted < 0.25) return 'At Risk';
  if (predicted > 0 && current / predicted < 0.6) return 'Limited';
  return 'Available';
}

function getConfidence(predicted: number, current: number): number {
  if (predicted === 0 && current === 0) return 0.5;
  if (predicted === 0) return 0.8;
  const ratio = current / predicted;
  return Math.min(0.95, Math.max(0.4, 0.5 + ratio * 0.3));
}

function getMessage(label: AvailabilityLabel, itemName: string, days: number): string {
  switch (label) {
    case 'Unavailable':
      return `${itemName} is currently out of stock.`;
    case 'At Risk':
      return `${itemName} may run out within ${days} day(s) based on recent usage.`;
    case 'Limited':
      return `${itemName} has limited supply. Consider restocking soon.`;
    default:
      return `${itemName} has sufficient stock for the projected week.`;
  }
}

export async function generateAvailabilityInsights(): Promise<AiAvailabilityInsight[]> {
  const operationId = newOperationId();
  try {
    const forecasts = await generateWeeklyForecast();

    const insights = forecasts.map((f) => {
      const label = getLabel(f.currentQuantity, f.predictedWeeklyDemand);
      const confidence = getConfidence(f.predictedWeeklyDemand, f.currentQuantity);
      const daysLeft =
        f.averageDailyUsage > 0
          ? Math.floor(f.currentQuantity / f.averageDailyUsage)
          : 99;

      return {
        itemId: f.itemId,
        itemName: f.itemName,
        currentQuantity: f.currentQuantity,
        averageDailyUsage: f.averageDailyUsage,
        predictedWeeklyDemand: f.predictedWeeklyDemand,
        recommendedRestock: f.recommendedRestock,
        confidenceScore: Math.round(confidence * 100) / 100,
        availabilityLabel: label,
        message: getMessage(label, f.itemName, daysLeft),
      };
    });

    logger.info({ message: 'Availability insights generated', operationId, operation: 'aiInsights.generateAvailabilityInsights', itemCount: insights.length });
    return insights;
  } catch (err: unknown) {
    logger.error({ message: 'Generate availability insights failed', operationId, operation: 'aiInsights.generateAvailabilityInsights', ...errorMeta(err) });
    throw err;
  }
}
