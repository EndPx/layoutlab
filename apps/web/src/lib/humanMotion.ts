import { HUMAN_STRIDE_M } from "./humanGait";
import type { OperationsSnapshot } from "@layoutlab/simulation";
export function sampleHumanMotion(snapshot: Pick<OperationsSnapshot, "clockMs" | "motionHistory">, unitId: string) {
  const stopped = (source: string) => ({ distanceM: 0, phase: 0, heading: 0, moving: false, source });
  if (!Number.isFinite(snapshot.clockMs) || snapshot.clockMs < 0) return stopped("invalid-stopped");
  const history = snapshot.motionHistory.filter(h => h.unitId === unitId);
  if (history.some(h => !h.segments)) return stopped("legacy-stopped");
  const segments = history.flatMap(h => h.segments ?? []).sort((a,b) => a.startMs-b.startMs);
  let distanceM = 0, heading = 0, moving = false, previousEnd = -1;
  for (const s of segments) {
    if (![s.fromX,s.fromZ,s.toX,s.toZ,s.startMs,s.endMs].every(Number.isFinite) || s.startMs < 0 || s.endMs <= s.startMs || s.startMs < previousEnd) return stopped("invalid-stopped");
    previousEnd = s.endMs;
    const dx = s.toX-s.fromX, dz = s.toZ-s.fromZ, length = Math.hypot(dx,dz)/1000;
    if (snapshot.clockMs <= s.startMs) continue;
    distanceM += Math.min(1,(snapshot.clockMs-s.startMs)/(s.endMs-s.startMs))*length;
    if (length > 0) heading = Math.atan2(dx,dz);
    if (snapshot.clockMs < s.endMs && length > 0) moving = true;
  }
  return { distanceM, phase: distanceM % HUMAN_STRIDE_M / HUMAN_STRIDE_M, heading, moving, source: "history" };
}
export function sampleHumanMotions(snapshot: Pick<OperationsSnapshot, "clockMs" | "motionHistory">, unitIds: readonly string[]) {
 const grouped = new Map<string, OperationsSnapshot['motionHistory']>();
 for (const h of snapshot.motionHistory) { const rows=grouped.get(h.unitId) ?? []; rows.push(h); grouped.set(h.unitId,rows); }
 return new Map(unitIds.map(id => [id, sampleHumanMotion({clockMs:snapshot.clockMs,motionHistory:grouped.get(id) ?? []},id)]));
}
