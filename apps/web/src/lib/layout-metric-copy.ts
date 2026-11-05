/** Presentation only: exact reports and metric units remain unchanged. */
export const layoutMetricLabels = { shipped: 'Shipped orders', makespanMs: 'Time to finish', totalWaitMs: 'Combined waiting', backlog: 'Remaining orders' };
export type LayoutMetricKey = keyof typeof layoutMetricLabels;
export function formatLayoutMetric(key: LayoutMetricKey, value: unknown, delta = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
  const sign = value < 0 ? '-' : delta && value > 0 ? '+' : '';
  const absolute = Math.abs(value);
  if (key === 'shipped' || key === 'backlog') return `${sign}${absolute}`;
  const minutes = Math.floor(absolute / 60000);
  const seconds = Number(((absolute % 60000) / 1000).toFixed(3));
  return `${sign}${minutes ? `${minutes} min ` : ''}${seconds} s`;
}
export function exactLayoutMetric(key: LayoutMetricKey, value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} ${key.endsWith('Ms') ? 'ms' : 'orders'}` : 'unavailable';
}

export const layoutOutcomeMeaning: Record<string, string> = {
  improved: 'Better on at least one measured criterion, with none worse.',
  worse: 'Worse on at least one measured criterion, with none better.',
  mixed: 'Some measured criteria improved and others worsened; no overall gain is claimed.',
  'no-improvement': 'No improvement under the measured comparison criteria.',
};
