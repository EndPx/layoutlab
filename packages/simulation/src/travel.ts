import { MAX_TIME_MS } from "./schema.js";

// Conservative travel-time oracle for v3-M2a: segment durations round UP
// from declared distance and speed. Domain motion/path events arrive in a
// later milestone; this helper only pins the rounding contract now.
// Exact literals: 1000mm@3000mm/s=334ms; 1501mm@1000=1501ms;
// 1mm@3000=1ms; zero distance=0ms.
export function travelTimeMs(
  distanceMm: number,
  speedMmPerSecond: number,
): number {
  if (
    !Number.isSafeInteger(distanceMm) ||
    distanceMm < 0 ||
    !Number.isSafeInteger(speedMmPerSecond) ||
    speedMmPerSecond <= 0
  ) {
    throw new Error(
      "travelTimeMs requires a nonnegative safe-integer distanceMm and a positive safe-integer speedMmPerSecond",
    );
  }
  if (distanceMm === 0) {
    return 0;
  }
  // Exact ceil(distanceMm * 1000 / speed) via BigInt: no float drift, and
  // overflow is detected exactly instead of wrapping or losing precision.
  const result =
    (BigInt(distanceMm) * 1000n + BigInt(speedMmPerSecond) - 1n) /
    BigInt(speedMmPerSecond);
  if (result > BigInt(MAX_TIME_MS)) {
    throw new Error(
      `travelTimeMs result exceeds the ${MAX_TIME_MS}ms simulation horizon bound`,
    );
  }
  return Number(result);
}
