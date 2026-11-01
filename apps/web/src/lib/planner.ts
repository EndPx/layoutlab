import {
  fitsFixedOrientation,
  type Assignment,
  type Product,
  type Scenario,
  type StorageLocation,
} from "@layoutlab/core";

export type DemandBucket = "low" | "mid" | "high";

export function computeDemandUnits(scenario: Scenario): Map<string, number> {
  const units = new Map<string, number>();
  for (const p of scenario.products) units.set(p.id, 0);
  for (const order of scenario.orders) {
    for (const line of order.lines) {
      units.set(line.productId, (units.get(line.productId) ?? 0) + order.frequency * line.quantity);
    }
  }
  return units;
}

export function demandBucket(units: number, maxUnits: number): DemandBucket {
  if (maxUnits <= 0) return "low";
  const r = units / maxUnits;
  if (r < 0.34) return "low";
  if (r < 0.67) return "mid";
  return "high";
}

export const DEMAND_META: Record<DemandBucket, { label: string; symbol: string }> = {
  low: { label: "Low demand", symbol: "○" },
  mid: { label: "Mid demand", symbol: "◐" },
  high: { label: "High demand", symbol: "●" },
};

export function checkCompatibility(
  product: Product,
  location: StorageLocation,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (product.requiredStorageClass !== location.storageClass) {
    reasons.push(`class ${product.requiredStorageClass}≠${location.storageClass}`);
  }
  if (location.allowedProductIds !== undefined && !location.allowedProductIds.includes(product.id)) {
    reasons.push("product not allowed here");
  }
  if (product.allowedLocationIds !== undefined && !product.allowedLocationIds.includes(location.id)) {
    reasons.push("location not allowed");
  }
  if (!fitsFixedOrientation(product, location)) reasons.push("load exceeds box");
  return { ok: reasons.length === 0, reasons };
}

export function isLocked(
  product: Product,
  lockedIds: string[],
): { locked: boolean; reason: string | null } {
  if (product.lockedLocationId !== undefined) {
    return { locked: true, reason: `fixed to ${product.lockedLocationId}` };
  }
  if (lockedIds.includes(product.id)) return { locked: true, reason: "locked by requirements" };
  return { locked: false, reason: null };
}

export type RelocationRow = {
  productId: string;
  fromId: string;
  toId: string;
  compatible: boolean;
  compatReason: string;
  reason: string;
};

export function buildRelocationRows(
  baseline: Assignment[],
  candidate: Assignment[],
  scenario: Scenario,
  reasonFor: (productId: string) => string,
): RelocationRow[] {
  const base = new Map(baseline.map((a) => [a.productId, a.locationId]));
  const products = new Map(scenario.products.map((p) => [p.id, p]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  const rows: RelocationRow[] = [];
  for (const c of candidate) {
    const fromId = base.get(c.productId);
    if (fromId === undefined || fromId === c.locationId) continue;
    const product = products.get(c.productId);
    const to = locations.get(c.locationId);
    let compatible = false;
    let compatReason = "unknown ref";
    if (product && to) {
      const r = checkCompatibility(product, to);
      compatible = r.ok;
      compatReason = r.ok ? "compatible" : r.reasons.join("; ");
    }
    rows.push({
      productId: c.productId,
      fromId,
      toId: c.locationId,
      compatible,
      compatReason,
      reason: reasonFor(c.productId),
    });
  }
  rows.sort((a, b) => (a.productId < b.productId ? -1 : 1));
  return rows;
}
