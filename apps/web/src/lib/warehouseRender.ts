// R1 warehouse rendering helpers: v2 derivative routing, role PBR materials
// for the textureless v1 fallbacks, and pure carried-cargo instancing math.
//
// Material truth (see docs/WAREHOUSE_R1_RENDER_REVIEW.md): every v1 GLB
// carries ONE layoutlab-fallback-* material with no textures and no UVs
// (source MDL/textures/subsets were dropped by the W1 conversion). The v2
// derivatives next to them (scripts/warehouse-usd-to-glb-v2.py) preserve the
// source geometry, face-varying st UVs and per-face material splits; box and
// crate also embed their source PNGs. This module routes the renderer to a
// v2 sibling when one exists and keeps the verified v1 as a per-asset
// fallback — a failed derivative never becomes a silent proxy cube.
import * as THREE from "three";
import {
  allocateCarryCells,
  carryMarkerPose,
  type CarryCell,
  type CarryDock,
} from "./operations";

const MM = 0.001;

// Original public URL -> v2 derivative sibling (originals stay untouched).
export const V2_DERIVATIVES: Record<string, string> = {
  "/assets/warehouse-section/box_cardboard_a01.glb":
    "/assets/warehouse-section/box_cardboard_a01-v2.glb",
  "/assets/warehouse-section/crate_blue_a01.glb":
    "/assets/warehouse-section/crate_blue_a01-v2.glb",
  "/assets/warehouse-cargo/cart_luggage_platform_a01.glb":
    "/assets/warehouse-cargo/cart_luggage_platform_a01-v2.glb",
  "/assets/warehouse-section/environment_floor_a01.glb":
    "/assets/warehouse-section/environment_floor_a01-v2.glb",
  "/assets/warehouse-section/rack_large_empty_a02.glb":
    "/assets/warehouse-section/rack_large_empty_a02-v2.glb",
};

export function derivativeUrlFor(url: string): string | null {
  return V2_DERIVATIVES[url] ?? null;
}

export function isDerivativeUrl(url: string): boolean {
  return Object.values(V2_DERIVATIVES).includes(url);
}

// ---- Role PBR replacements for v1 fallback assets -------------------------
// The v1 geometries have no TEXCOORD_0, so no texture map can be applied to
// them honestly (a map would sample garbage, not source UVs). Roles differ
// by color + roughness + metalness only, tuned so concrete, painted steel,
// cardboard, plastic and equipment read as different materials under the
// shadowed key light. Factors mirror the bindings' documented v1 hues.
export type RenderRole =
  | "concreteFloor"
  | "wallConcrete"
  | "entranceConcrete"
  | "rackSteel"
  | "cardboard"
  | "plasticCrate"
  | "cartEquipment"
  | "packingStation"
  | "generic";

export const ROLE_PBR: Record<
  RenderRole,
  { color: number; roughness: number; metalness: number }
> = {
  concreteFloor: { color: 0x8a8f94, roughness: 0.95, metalness: 0.0 },
  wallConcrete: { color: 0xaaa69c, roughness: 0.9, metalness: 0.0 },
  entranceConcrete: { color: 0xaeaaa2, roughness: 0.85, metalness: 0.05 },
  rackSteel: { color: 0x738ba8, roughness: 0.5, metalness: 0.35 },
  cardboard: { color: 0xc29a6b, roughness: 0.9, metalness: 0.0 },
  plasticCrate: { color: 0x2659bf, roughness: 0.55, metalness: 0.0 },
  cartEquipment: { color: 0xb8b3a8, roughness: 0.6, metalness: 0.25 },
  packingStation: { color: 0x38634d, roughness: 0.6, metalness: 0.2 },
  generic: { color: 0x9aa3ab, roughness: 0.8, metalness: 0.1 },
};

export function roleForUrl(url: string): RenderRole {
  if (url.includes("environment_floor")) return "concreteFloor";
  if (url.includes("structure_wall_entrance")) return "entranceConcrete";
  if (url.includes("structure_wall")) return "wallConcrete";
  if (url.includes("rack_large")) return "rackSteel";
  if (url.includes("box_cardboard")) return "cardboard";
  if (url.includes("crate_")) return "plasticCrate";
  if (url.includes("cart_luggage") || url.includes("handTruck")) return "cartEquipment";
  if (url.includes("table_packing")) return "packingStation";
  return "generic";
}

const roleMaterialCache = new Map<RenderRole, THREE.MeshStandardMaterial>();

export function makeRoleMaterial(role: RenderRole): THREE.MeshStandardMaterial {
  let mat = roleMaterialCache.get(role);
  if (!mat) {
    const p = ROLE_PBR[role];
    mat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: p.roughness,
      metalness: p.metalness,
      side: THREE.DoubleSide,
    });
    mat.userData["r1Role"] = role;
    roleMaterialCache.set(role, mat);
  }
  return mat;
}

export type PreparedAsset = { mode: "source-v2" | "replacement-v1"; materials: string[] };

// Prepare one loaded GLB group in place (idempotent; the module GLB cache
// shares groups across views/remounts):
// - v2 materials (layoutlab-source-* / layoutlab-replacement-*) are kept as
//   authored; only texture anisotropy is raised for the textured ones.
// - v1 fallback materials are replaced by the asset's role PBR material.
//   Existing clipping planes (wall cutaway) are carried over by callers that
//   clone afterwards; a plane already set here is preserved too.
export function prepareAssetGroup(
  group: THREE.Object3D,
  sourceUrl: string,
  maxAnisotropy: number,
): PreparedAsset {
  const role = roleForUrl(sourceUrl);
  const names: string[] = [];
  let sawV2 = false;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const mat = m as THREE.Material;
      names.push(mat.name || "(unnamed)");
      if (
        mat.name.startsWith("layoutlab-source-") ||
        mat.name.startsWith("layoutlab-replacement-")
      ) {
        sawV2 = true;
        const std = mat as THREE.MeshStandardMaterial;
        // P2a replacement response only: keep source-textured carton/plastic
        // and all per-face splits/UVs intact. These are display PBR factors,
        // not recovered source MDL properties. Idempotent on cached groups.
        if (mat.name.startsWith("layoutlab-replacement-")) {
          if (mat.name.includes("concrete__plain")) {
            std.color.setHex(0x727b82);
            std.roughness = 0.96;
          } else if (mat.name.includes("painted_unique_rack")) {
            std.color.setHex(0x405a70);
            std.roughness = 0.48;
          } else if (mat.name.includes("unique_rack")) {
            std.color.setHex(0x939fa8);
            std.roughness = 0.38;
          }
        }
        for (const tex of [std.map, std.metalnessMap, std.roughnessMap, std.normalMap]) {
          if (tex) tex.anisotropy = Math.max(tex.anisotropy, maxAnisotropy);
        }
        return mat;
      }
      if ((mat as THREE.Material).userData["r1Role"]) return mat;
      const replacement = makeRoleMaterial(role);
      // Role materials are cached and shared across assets: never write
      // per-mesh clipping planes onto the shared instance.
      if (mat.clippingPlanes && mat.clippingPlanes.length > 0) {
        const clipped = replacement.clone();
        clipped.clippingPlanes = mat.clippingPlanes;
        return clipped;
      }
      return replacement;
    });
    o.material = Array.isArray(o.material) ? next : next[0]!;
  });
  return { mode: sawV2 ? "source-v2" : "replacement-v1", materials: names };
}

// ---- Solid carried cargo (pure planning; the view only uploads matrices) --
// Representation (explicit): each carried unit is ONE sourced generic carton
// mesh (box_cardboard_a01 v2 geometry, source cardboard textures where the
// derivative loaded) non-uniformly scaled so its AABB equals the declared
// SKU dimensions exactly. SKU dimensions, cells, capacity and stock are
// never altered to make anything fit; an item that overfills its cell, an
// unknown SKU, or units beyond capacity are rejected here and reported by
// the caller instead of being drawn as valid-looking cargo.

export type CargoFamily = "cardboard" | "plastic";

export type CargoItemTransform = {
  unitId: string;
  productId: string;
  itemOrdinal: number;
  crateIndex: number;
  cellId: string;
  centerM: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  yawDeg: number;
  family: CargoFamily;
};

export type CargoRejection = {
  unitId: string;
  productId: string;
  itemOrdinal: number | null;
  reason: string;
};

export type CargoPlan = {
  items: CargoItemTransform[];
  rejected: CargoRejection[];
  overflow: { unitId: string; units: number }[];
};

export function planCargoTransforms(args: {
  units: {
    unitId: string;
    pose: { x: number; z: number };
    carried: { productId: string; quantity: number }[];
  }[];
  docks: CarryDock[];
  cells: CarryCell[];
  floorTopYMm: number;
  cargoYawDeg: number;
  skuDims: ReadonlyMap<string, { width: number; depth: number; height: number }>;
  cartonSizeM: { x: number; y: number; z: number };
  familyOf: ReadonlyMap<string, CargoFamily>;
}): CargoPlan {
  const items: CargoItemTransform[] = [];
  const rejected: CargoRejection[] = [];
  const overflow: CargoPlan["overflow"] = [];
  for (const u of args.units) {
    if (u.carried.length === 0) continue;
    const { placements, overflowUnits } = allocateCarryCells(
      u.carried.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      args.docks.length,
      args.cells.length,
      args.cells.map((c) => c.id),
    );
    if (overflowUnits > 0) overflow.push({ unitId: u.unitId, units: overflowUnits });
    for (const pl of placements) {
      const dims = args.skuDims.get(pl.productId);
      const cell = args.cells.find((c) => c.id === pl.cellId);
      const dock = args.docks[pl.crateIndex];
      if (!dims || !cell || !dock) {
        rejected.push({
          unitId: u.unitId, productId: pl.productId, itemOrdinal: pl.itemOrdinal,
          reason: "missing SKU dims/cell/dock",
        });
        continue;
      }
      const pose = carryMarkerPose(dims, cell, args.floorTopYMm, args.cargoYawDeg);
      if (!pose.fitsCell) {
        rejected.push({
          unitId: u.unitId, productId: pl.productId, itemOrdinal: pl.itemOrdinal,
          reason: `${dims.width}x${dims.depth}x${dims.height} overfills cell ${dock.id}${cell.id}`,
        });
        continue;
      }
      items.push({
        unitId: u.unitId,
        productId: pl.productId,
        itemOrdinal: pl.itemOrdinal,
        crateIndex: pl.crateIndex,
        cellId: pl.cellId,
        centerM: {
          x: u.pose.x * MM + (dock.xM + pose.xMm * MM),
          y: dock.yM + pose.yMm * MM,
          z: u.pose.z * MM + (dock.zM + pose.zMm * MM),
        },
        scale: {
          x: (dims.width / 1000) / args.cartonSizeM.x,
          y: (dims.height / 1000) / args.cartonSizeM.y,
          z: (dims.depth / 1000) / args.cartonSizeM.z,
        },
        yawDeg: pose.yawDeg,
        family: args.familyOf.get(pl.productId) ?? "cardboard",
      });
    }
  }
  return { items, rejected, overflow };
}

// Instance tint per cargo family: cardboard keeps the source texture hue;
// crate-bound (plastic) SKUs get a cool tint so the two families stay
// distinguishable on the same generic carton mesh. White = untinted.
export function cargoFamilyTint(family: CargoFamily): [number, number, number] {
  return family === "plastic" ? [0.78, 0.88, 1.05] : [1, 1, 1];
}
