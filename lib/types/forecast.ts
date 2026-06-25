// Forecast model - MATCHES smartstock-admin's forecast page. Consumption is
// derived from the last 30 days of `preparations` (recipe production history),
// converted to each product's base unit, to estimate how long current on-hand
// stock will last.

export interface ForecastResult {
  id: string;
  name: string;
  category: string;
  displayUnit: string;
  onHand: number; // base unit (g / ml / piece)
  avgPerDayBase: number; // average daily consumption in base unit
  daysLeft: number | null; // floor(onHand / avgPerDay); null when no consumption
}
