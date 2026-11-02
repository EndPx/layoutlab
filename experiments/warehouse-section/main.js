// W1 isolated static section preview (no core/app edits; fixture-driven).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MM = 0.001;
const mount = document.getElementById("mount");
const inspectEl = document.getElementById("inspect");
const statsEl = document.getElementById("stats");
const errorsEl = document.getElementById("errors");
const failures = [];
function fail(msg) {
  failures.push(msg);
  errorsEl.textContent = failures.join("\n");
  mount.dataset.consoleErrors = String(failures.length);
}
window.addEventListener("error", (e) => fail("window.onerror: " + (e.message || e.type)));
window.addEventListener("unhandledrejection", (e) => fail("unhandledrejection: " + String(e.reason)));

const GLBS = {
  floor: "./fixture-assets/environment_floor_a01.glb",
  wall: "./fixture-assets/structure_wall_straight_a01.glb",
  rack: "./fixture-assets/rack_large_empty_a02.glb",
  box: "./fixture-assets/box_cardboard_a01.glb",
  crate: "./fixture-assets/crate_blue_a01.glb",
  cart: "./fixture-assets/handTruck_convertible_steel_orange_a01.glb",
};
// Served by scripts/warehouse-section-serve.mjs which maps ./fixture-assets -> built GLBs.
const GLB_SIZES = {
  floor: [6.0, 0.100008, 6.0],
  wall: [0.740001, 11.100051, 6.000004],
  rack: [3.999978, 3.010001, 2.066581],
  box: [0.699435, 0.509927, 0.521152],
  crate: [0.605133, 0.25322, 0.405133],
  cart: [0.500942, 1.348144, 0.480582],
};

let selectedId = "L1";
let view = "iso";
const t0 = performance.now();

const fixture = await fetch("./fixture.json").then((r) => {
  if (!r.ok) throw new Error("fixture HTTP " + r.status);
  return r.json();
});
const rack = fixture.racks[0];
const locs = new Map(fixture.locations.map((l) => [l.id, l]));

// Width-row slot resolver for this yaw-0 single-rack section (mirrors the
// shared storage-anchor convention: cells split rack width, centers about
// rack center; yaw 0 keeps world axes aligned).
function slotCenter(locId) {
  const group = [...locs.values()].filter((l) => l.rackId === rack.id).sort((a, b) => (a.id < b.id ? -1 : 1));
  const i = group.findIndex((l) => l.id === locId);
  const w = rack.dimensionsMm.width;
  return { x: rack.positionMm.x - w / 2 + (w * (i + 0.5)) / group.length, z: rack.positionMm.z };
}
const anchors = new Map([...locs.keys()].map((id) => [id, slotCenter(id)]));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  mount.textContent = "3D unavailable (no WebGL).";
  fail("renderer: " + String(e));
  throw e;
}
const W = 860, H = 560;
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(W, H);
labelRenderer.domElement.className = "labels3d";
mount.replaceChildren(renderer.domElement, labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfbfcfe);
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 1;
controls.maxDistance = 40;

scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6f0, 0.95));
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(8, 12, 9);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8f2f2, 0.35);
fill.position.set(-3, 7, -2);
scene.add(fill);

function addLabel(text, cls, x, y, z, id) {
  const el = document.createElement("div");
  el.className = "tag3d " + cls;
  el.textContent = text;
  if (id) el.id = id;
  const obj = new CSS2DObject(el);
  obj.position.set(x, y, z);
  scene.add(obj);
  return obj;
}

const loader = new GLTFLoader();
async function loadGlb(url) {
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}
const loaded = {};
for (const [k, url] of Object.entries(GLBS)) {
  try {
    loaded[k] = await loadGlb(url);
  } catch (e) {
    fail("load " + k + ": " + String(e));
    throw e;
  }
}

// Floor: true 6x6m slab, top surface at y=0.
loaded.floor.position.set(...fixture.floorVisual.positionM);
scene.add(loaded.floor);
// Wall: true scale at the west perimeter (maxX aligned to room edge x=0),
// display-only cutaway above fixture cutawayYM (source scale preserved).
loaded.wall.position.set(...fixture.wallVisual.positionM);
renderer.localClippingEnabled = true;
{
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), fixture.wallVisual.cutawayYM);
  loaded.wall.traverse((o) => {
    if (o.isMesh) {
      o.material.clippingPlanes = [cut];
      o.material.clipShadows = false;
    }
  });
}
scene.add(loaded.wall);
mount.dataset.cutaway = String(fixture.wallVisual.cutawayYM);
// Rack: canonical per-axis fit (mesh-local scale before yaw; yaw 0 here).
{
  const s = GLB_SIZES.rack;
  loaded.rack.scale.set(
    rack.dimensionsMm.width / 1000 / s[0],
    rack.dimensionsMm.height / 1000 / s[1],
    rack.dimensionsMm.depth / 1000 / s[2],
  );
  loaded.rack.position.set(rack.positionMm.x * MM, 0, rack.positionMm.z * MM);
  scene.add(loaded.rack);
}
// Containers at true size on shelf decks (L2 crates stacked on deck 0 via
// source-normalized stack offsets; uniform scale 1.0 throughout).
const decks = fixture.shelfDecks.scaledY_M;
const visuals = []; // {loc, product, asset, baseY, mesh}
for (const a of fixture.assignments) {
  const c = anchors.get(a.locationId);
  for (const v of a.visuals) {
    const src = loaded[v.visualAsset === "box_cardboard_a01" ? "box" : "crate"];
    const m = src.clone();
    const baseY = decks[v.deck] + (v.stackOffsetMm || 0) * MM;
    m.position.set(c.x * MM, baseY, c.z * MM);
    scene.add(m);
    visuals.push({ loc: a.locationId, product: a.productId, asset: v.visualAsset, baseY, mesh: m });
  }
}
// Cart parked in its explicit bay at true size.
loaded.cart.position.set(fixture.cart.parkMm.x * MM, 0, fixture.cart.parkMm.z * MM);
scene.add(loaded.cart);
// Parking-bay outline (custom annotation, explicit declared bay).
{
  const bay = fixture.cart.parkingBayMm;
  const loop = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bay.minX * MM, 0.03, bay.minZ * MM),
      new THREE.Vector3(bay.maxX * MM, 0.03, bay.minZ * MM),
      new THREE.Vector3(bay.maxX * MM, 0.03, bay.maxZ * MM),
      new THREE.Vector3(bay.minX * MM, 0.03, bay.maxZ * MM),
    ]),
    new THREE.LineBasicMaterial({ color: 0xb45309 }),
  );
  scene.add(loop);
}

// Boundary loop (custom annotation).
{
  const w = fixture.room.widthMm * MM, d = fixture.room.depthMm * MM;
  const loop = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(w, 0.02, 0),
      new THREE.Vector3(w, 0.02, d), new THREE.Vector3(0, 0.02, d),
    ]),
    new THREE.LineBasicMaterial({ color: 0x0b6b6e }),
  );
  scene.add(loop);
}
// Slot floor-projection outlines (custom annotations, canonical usable rects).
const slotLines = new Map();
for (const [id, c] of anchors) {
  const u = locs.get(id).usableDimensionsMm;
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3((c.x - u.width / 2) * MM, 0.03, (c.z - u.depth / 2) * MM),
    new THREE.Vector3((c.x + u.width / 2) * MM, 0.03, (c.z - u.depth / 2) * MM),
    new THREE.Vector3((c.x + u.width / 2) * MM, 0.03, (c.z + u.depth / 2) * MM),
    new THREE.Vector3((c.x - u.width / 2) * MM, 0.03, (c.z + u.depth / 2) * MM),
  ]);
  const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: id === selectedId ? 0x0b6b6e : 0x4a5568 }));
  scene.add(line);
  slotLines.set(id, line);
}
// Selected-visual 3D outline (rebuilt on selection).
let selBox = null;
function rebuildSelBox() {
  if (selBox) {
    scene.remove(selBox);
    selBox.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    selBox = null;
  }
  const group = new THREE.Group();
  for (const v of visuals.filter((x) => x.loc === selectedId)) {
    const s = GLB_SIZES[v.asset === "box_cardboard_a01" ? "box" : "crate"];
    const c = anchors.get(v.loc);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(s[0], s[1], s[2])),
      new THREE.LineBasicMaterial({ color: 0x0b6b6e }),
    );
    edges.position.set(c.x * MM, v.baseY + s[1] / 2, c.z * MM);
    group.add(edges);
  }
  selBox = group;
  scene.add(group);
}
// L1 approach marker (custom annotation; only the single associated approach).
{
  const p = locs.get("L1").pickPointMm;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x0b6b6e, roughness: 0.5 }),
  );
  marker.position.set(p.x * MM, 0.09, p.z * MM);
  scene.add(marker);
}
// Packing marker (custom annotation).
{
  const p = fixture.packingPointMm;
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0b6b6e, roughness: 0.5 }),
  );
  pack.position.set(p.x * MM, 0.15, p.z * MM);
  scene.add(pack);
}
const slotLabels = [
  addLabel("R1 rack (sourced)", "", 0.5, 2.2, 0.9),
  addLabel("L1 · sku-a box", "loc", anchors.get("L1").x * MM, 0.55, anchors.get("L1").z * MM),
  addLabel("L2 · sku-b ×2 stacked", "loc", anchors.get("L2").x * MM, 1.45, anchors.get("L2").z * MM),
];
const planLabels = [
  addLabel("PICK L1 (2900,1500)", "", 3.25, 0.3, 1.15),
  addLabel("PACK (3000,3000)", "pack", 3.0, 0.55, 3.45),
  addLabel("CART-HT1", "", 4.5, 1.0, 2.15),
  addLabel("WALL x<0 cutaway 2.5m", "", -0.34, 2.8, 4.8),
  addLabel("6×6m boundary", "", 3.0, 0.15, 6.05),
];
// Top plan keeps identifiable L1/L2 anchors via offset chips + leader lines
// (never by hiding every location label). Anchors never move; display-only.
const topChips = [
  addLabel("L1 · sku-a box", "loc", anchors.get("L1").x * MM, 0.15, 0.45, "chip-top-L1"),
  addLabel("L2 · sku-b ×2", "loc", 1.55, 0.15, 2.75, "chip-top-L2"),
];
const topLeaders = [];
for (const [chip, locId] of [[topChips[0], "L1"], [topChips[1], "L2"]]) {
  const c = anchors.get(locId);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(chip.position.x, 0.15, chip.position.z),
      new THREE.Vector3(c.x * MM, 0.15, c.z * MM),
    ]),
    new THREE.LineBasicMaterial({ color: 0x0b6b6e }),
  );
  scene.add(line);
  topLeaders.push(line);
}

function setView(v) {
  view = v;
  mount.dataset.view = v;
  for (const o of slotLabels) o.visible = v !== "top";
  for (const o of topChips) o.visible = v === "top";
  for (const o of topLeaders) o.visible = v === "top";
  for (const id of ["iso", "top", "inspect"]) {
    document.getElementById("v-" + id).setAttribute("aria-pressed", String(id === v));
  }
  const c = anchors.get(selectedId);
  if (v === "top") {
    camera.position.set(2.7, 10, 3.001);
    controls.target.set(2.7, 0, 3);
  } else if (v === "inspect") {
    camera.position.set(c.x * MM + 2.2, 1.9, c.z * MM + 2.6);
    controls.target.set(c.x * MM, 0.8, c.z * MM);
  } else {
    camera.position.set(8.6, 7.2, 10.6);
    controls.target.set(2.2, 0, 2.6);
  }
  controls.update();
  render();
}
function setSelected(id) {
  selectedId = id;
  mount.dataset.selected = id;
  for (const lid of ["L1", "L2"]) {
    document.getElementById("sel-" + lid).setAttribute("aria-pressed", String(lid === id));
    const line = slotLines.get(lid);
    if (line) line.material.color.set(lid === id ? 0x0b6b6e : 0x4a5568);
  }
  rebuildSelBox();
  renderInspect();
  if (view === "inspect") setView("inspect");
  else render();
}
// Full-3D fit verdict from DECLARED ceiling bounds (authoritative actual-AABB
// proof lives in scripts/warehouse-section-fit.mjs): full3Dfit only when
// every visual passes footprint (X/Z), slot height (Y), and deck clearance;
// otherwise footprint-only or exceeds. Never claims full3Dfit from X/Z alone.
function fitVerdict(locId) {
  const loc = locs.get(locId);
  const u = loc.usableDimensionsMm;
  const slotTopMm = decks[0] * 1000 + u.height;
  const rows = fixture.assignments.filter((a) => a.locationId === locId);
  const per = rows.flatMap((a) => a.visuals.map((v) => {
    const t = v.trueDimsMm;
    const topMm = decks[v.deck] * 1000 + (v.stackOffsetMm || 0) + t.height;
    const above = decks.filter((d) => d > decks[v.deck] + 1e-9).sort((x, y) => x - y)[0];
    const footprintOk = t.width <= u.width && t.depth <= u.depth;
    const heightOk = topMm <= slotTopMm;
    const deckOk = above === undefined || topMm <= above * 1000;
    return { v, topMm, above, footprintOk, heightOk, deckOk, full: footprintOk && heightOk && deckOk };
  }));
  const verdict = per.every((p) => p.full)
    ? "full3Dfit"
    : (per.every((p) => p.footprintOk) ? "footprint-only" : "exceeds");
  return { verdict, per, slotTopMm };
}
function renderInspect() {
  const loc = locs.get(selectedId);
  const c = anchors.get(selectedId);
  const rows = fixture.assignments.filter((a) => a.locationId === selectedId);
  const lines = rows.map((a) =>
    `${a.productId} ×${a.quantity}: ` + a.visuals.map((v) => `${v.visualAsset} ${v.trueDimsMm.width}×${v.trueDimsMm.depth}×${v.trueDimsMm.height}mm deck ${v.deck} (base y=${(decks[v.deck] + (v.stackOffsetMm || 0) / 1000).toFixed(3)}m)`).join("; ")
  );
  const { verdict, per, slotTopMm } = fitVerdict(selectedId);
  const checks = per.map((p) => {
    const t = p.v.trueDimsMm;
    const u = loc.usableDimensionsMm;
    return `${p.v.visualAsset}: footprint ${t.width}×${t.depth} vs ${u.width}×${u.depth} → ${p.footprintOk ? "inside" : "EXCEEDS"}; ` +
      `top ${p.topMm.toFixed(1)} vs slot ${slotTopMm.toFixed(1)} → ${p.heightOk ? "inside" : "EXCEEDS"}; ` +
      `deck ${p.above === undefined ? "none above" : "clear " + (p.above * 1000).toFixed(1)} → ${p.deckOk ? "clear" : "HITS"}; ` +
      `${p.full ? "full3Dfit ✓" : "not-full-3D"}`;
  });
  inspectEl.innerHTML =
    `<p><b>${selectedId}</b> slot center (${c.x}, ${c.z})mm · rack R1 · usable ${loc.usableDimensionsMm.width}×${loc.usableDimensionsMm.depth}×${loc.usableDimensionsMm.height}mm · <b>${verdict}</b></p>` +
    `<p>Pick approach: (${loc.pickPointMm.x}, ${loc.pickPointMm.z})mm (storage and approach references are distinct)</p>` +
    lines.map((l) => `<p>${l}</p>`).join("") +
    checks.map((l) => `<p>${l}</p>`).join("");
  mount.dataset.anchors = [...anchors.entries()].map(([id, p]) => `${id}:${p.x},${p.z}`).join(";");
  for (const id of [...locs.keys()]) mount.dataset["fit" + id] = fitVerdict(id).verdict;
}
function render() {
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
controls.addEventListener("change", render);
document.getElementById("v-iso").addEventListener("click", () => setView("iso"));
document.getElementById("v-top").addEventListener("click", () => setView("top"));
document.getElementById("v-inspect").addEventListener("click", () => setView("inspect"));
document.getElementById("sel-L1").addEventListener("click", () => setSelected("L1"));
document.getElementById("sel-L2").addEventListener("click", () => setSelected("L2"));

rebuildSelBox();
renderInspect();
setView("iso");
render();
const loadMs = Math.round(performance.now() - t0);
// Stats after first render: renderer info + GLB resource bytes.
requestAnimationFrame(() => {
  const info = renderer.info;
  const res = performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".glb"));
  const bytes = res.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0);
  const names = res.map((r) => r.name.split("/").pop() + "=" + Math.round((r.encodedBodySize || r.transferSize || 0) / 1024) + "KB");
  statsEl.textContent =
    `load ${loadMs}ms · GLB requests ${res.length} · GLB bytes ${bytes} (${(bytes / 1048576).toFixed(2)}MB)\n` +
    names.join(" ") +
    `\ntriangles ${info.render.triangles} · draw calls ${info.render.calls} · geometries ${info.memory.geometries} · textures ${info.memory.textures}` +
    `\nviews: iso/top/inspect via toolbar; orbit with mouse; selection L1/L2.`;
  mount.dataset.section = "ready";
  mount.dataset.glbbytes = String(bytes);
  mount.dataset.triangles = String(info.render.triangles);
  mount.dataset.drawcalls = String(info.render.calls);
});
