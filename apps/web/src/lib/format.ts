// Presentation-only formatting: integer core millimeters become display
// meters. Core values are never rounded or mutated, only rendered.
export function formatMeters(mm: number | null | undefined): string {
  if (mm === null || mm === undefined) return "N/A";
  return `${(mm / 1000).toFixed(1)} m`;
}

export function formatImprovement(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "N/A";
  return `${pct.toFixed(1)}%`;
}
