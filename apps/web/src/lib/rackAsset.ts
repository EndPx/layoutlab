// Canonical browser rack asset (M4): actual SimReady GLB derivative.
// Single-sourced provenance lives in assets/manifests/rack_large_empty_a01.
// manifest.json; these constants mirror its derivative + canonical-scaling
// sections so the 3D view fits every rack without reading the manifest.
export const RACK_GLB_URL = "/assets/rack_large_empty_a01.glb";
export const RACK_GLB_SHA256 = "571cc601bbbf8759977e05c5104a1d9381a682d2537942a238c68ebf8f8ae9ea";
export const RACK_MANIFEST_REF = "assets/manifests/rack_large_empty_a01.manifest.json";
export const RACK_LICENSE = "CC-BY-4.0";

// Transformed GLB bounds in meters (Y-up, ground origin; calibrated <1 mm).
export const RACK_GLB_MIN_M = [-1.999988, 0.0, -1.033291] as const;
export const RACK_GLB_MAX_M = [1.999989, 3.010001, 1.03329] as const;
export const RACK_GLB_SIZE_M = [3.999977, 3.010001, 2.066581] as const;

// Per-rack canonical scale: fit the GLB meters to the rack footprint
// (width/height/depth mm) with explicit per-axis scaling. Scale applies in
// mesh-local space before yaw, matching the core footprint convention.
export function rackScaleFor(dimensionsMm: { width: number; depth: number; height: number }): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: dimensionsMm.width / 1000 / RACK_GLB_SIZE_M[0],
    y: dimensionsMm.height / 1000 / RACK_GLB_SIZE_M[1],
    z: dimensionsMm.depth / 1000 / RACK_GLB_SIZE_M[2],
  };
}

export type WebAssetRef = {
  rackId: string;
  kind: "simready-glb";
  ref: string;
  sha256: string;
  note: string;
};

export function webAssetRefs(rackIds: string[]): WebAssetRef[] {
  return rackIds.map((rackId) => ({
    rackId,
    kind: "simready-glb",
    ref: RACK_GLB_URL,
    sha256: RACK_GLB_SHA256,
    note: `SimReady rack_large_empty_a01 GLB (${RACK_LICENSE}); manifest ${RACK_MANIFEST_REF}.`,
  }));
}
