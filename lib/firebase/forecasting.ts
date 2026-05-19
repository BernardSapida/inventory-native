import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from './config';
import { ForecastResult } from '@/lib/types/forecast';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

export async function generateWeeklyForecast(): Promise<ForecastResult[]> {
  const operationId = newOperationId();
  try {
    const logsQuery = query(
      collection(db, 'inventory_logs'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const [logsSnap, invSnap] = await Promise.all([
      getDocs(logsQuery),
      getDocs(collection(db, 'inventory')),
    ]);

    const itemMap = new Map<string, { name: string; quantity: number; threshold: number }>();
    invSnap.forEach((d) => {
      const data = d.data();
      itemMap.set(d.id, {
        name: (data.name as string) ?? '',
        quantity: Number(data.quantity ?? 0),
        threshold: Number(data.minimumThreshold ?? 0),
      });
    });

    const usageMap = new Map<string, { total: number; days: Set<string> }>();
    logsSnap.forEach((d) => {
      const data = d.data();
      const action = (data.action as string) ?? '';
      if (action !== 'recipe_used' && action !== 'adjusted') return;
      const change = Number(data.quantityChanged ?? 0);
      if (change >= 0) return;

      const itemId = (data.itemId as string) ?? '';
      const date = data.createdAt
        ? (data.createdAt as { toDate: () => Date }).toDate().toDateString()
        : 'unknown';

      if (!usageMap.has(itemId)) usageMap.set(itemId, { total: 0, days: new Set() });
      const entry = usageMap.get(itemId)!;
      entry.total += Math.abs(change);
      entry.days.add(date);
    });

    const results: ForecastResult[] = [];
    for (const [itemId, item] of itemMap) {
      const usage = usageMap.get(itemId);
      const avgDaily = usage && usage.days.size > 0 ? usage.total / usage.days.size : 0;
      const predicted = Math.ceil(avgDaily * 7);
      const recommended = Math.max(0, predicted - item.quantity);
      results.push({
        itemId,
        itemName: item.name,
        currentQuantity: item.quantity,
        averageDailyUsage: Math.round(avgDaily * 100) / 100,
        predictedWeeklyDemand: predicted,
        recommendedRestock: recommended,
        lowRisk: item.quantity >= item.threshold,
      });
    }

    const sorted = results.sort((a, b) => b.recommendedRestock - a.recommendedRestock);
    logger.info({ message: 'Weekly forecast generated', operationId, operation: 'forecasting.generateWeeklyForecast', itemCount: sorted.length });
    return sorted;
  } catch (err: unknown) {
    logger.error({ message: 'Generate weekly forecast failed', operationId, operation: 'forecasting.generateWeeklyForecast', ...errorMeta(err) });
    throw err;
  }
}
