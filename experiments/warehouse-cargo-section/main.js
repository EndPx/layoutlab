// Cargo-C1 isolated diagnostic viewer (no core/app edits; fixture-driven).
// Loads fixture.json models at true size, optional display-only markers
// (profile outline, deck witness plane, load labels). Static; orbit enabled.
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

const params = new URLSearchParams(location.search);
let view = params.get("view") || "iso";
const t0 = performance.now();

const fixtureName = (params.get("fixture") || "fixture").replace(/[^a-z0-9_-]/gi, "") || "fixture";
const fixture = await fetch("./" + fixtureName + ".json").then((r) => {
  if (!r.ok) throw new Error("fixture HTTP " + r.status);
  return r.json();
});
document.getElementById("provenance").textContent = fixture.provenance || "";

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
const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.minDistance = 0.2;
controls.maxDistance = 30;

scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6f0, 0.95));
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(3, 4, 2.5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8f2f2, 0.35);
fill.position.set(-2, 2, -1.5);
scene.add(fill);

// Ground grid (display-only scale reference, 100mm cells).
scene.add(new THREE.GridHelper(3, 30, 0x94a3b8, 0xcbd5e1));

function addLabel(text, x, y, z) {
  const el = document.createElement("div");
  el.className = "tag3d";
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(x, y, z);
  scene.add(obj);
  return obj;
}

const loader = new GLTFLoader();
const center = new THREE.Vector3();
{
  let n = 0;
  for (const m of fixture.models) {
    let scene3d;
    try {
      scene3d = (await loader.loadAsync(m.url)).scene;
    } catch (e) {
      fail("load " + m.id + ": " + String(e));
      throw e;
    }
    scene3d.position.set(m.positionM[0], m.positionM[1], m.positionM[2]);
    scene3d.rotation.y = ((m.yawDeg || 0) * Math.PI) / 180;
    scene.add(scene3d);
    const box = new THREE.Box3().setFromObject(scene3d);
    const c = box.getCenter(new THREE.Vector3());
    center.add(c);
    n++;
    if (m.label) addLabel(m.label, c.x, box.max.y + 0.03, c.z);
  }
  if (n > 0) center.multiplyScalar(1 / n);
}
// Display-only markers from fixture.markers: {kind:'loopXZ', yMm, pointsMm, color}
// or {kind:'box', centerMm, sizeMm, color} or {kind:'label', text, atMm}.
for (const mk of fixture.markers || []) {
  if (mk.kind === "loopXZ") {
    const loop = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        mk.pointsMm.map(([x, z]) => new THREE.Vector3(x * MM, mk.yMm * MM, z * MM)),
      ),
      new THREE.LineBasicMaterial({ color: mk.color ?? "#0b6b6e" }),
    );
    scene.add(loop);
  } else if (mk.kind === "box") {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(mk.sizeMm[0] * MM, mk.sizeMm[1] * MM, mk.sizeMm[2] * MM)),
      new THREE.LineBasicMaterial({ color: mk.color ?? "#b45309" }),
    );
    edges.position.set(mk.centerMm[0] * MM, mk.centerMm[1] * MM, mk.centerMm[2] * MM);
    scene.add(edges);
  } else if (mk.kind === "label") {
    addLabel(mk.text, mk.atMm[0] * MM, mk.atMm[1] * MM, mk.atMm[2] * MM);
  } else if (mk.kind === "solidBox") {
    // Display-only true-size solid (e.g., carried items at declared positions).
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(mk.sizeMm[0] * MM, mk.sizeMm[1] * MM, mk.sizeMm[2] * MM),
      new THREE.MeshStandardMaterial({ color: mk.color ?? "#d97706", roughness: 0.7 }),
    );
    mesh.position.set(mk.centerMm[0] * MM, mk.centerMm[1] * MM, mk.centerMm[2] * MM);
    scene.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x1a202c }),
    );
    edges.position.copy(mesh.position);
    scene.add(edges);
  } else if (mk.kind === "plane") {
    // Display-only witness plane rect (e.g., deck support plane outline patch).
    const g = new THREE.PlaneGeometry(mk.sizeMm[0] * MM, mk.sizeMm[1] * MM);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: mk.color ?? "#0b6b6e", transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mk.centerMm[0] * MM, mk.yMm * MM, mk.centerMm[2] * MM);
    scene.add(mesh);
  }
}

function setView(v) {
  view = v;
  mount.dataset.view = v;
  const customCam = params.get("cam");
  const customTgt = params.get("target");
  if (customCam && customTgt) {
    camera.position.set(...customCam.split(",").map(Number));
    controls.target.set(...customTgt.split(",").map(Number));
    controls.update();
    render();
    return;
  }
  for (const id of ["iso", "top", "side"]) {
    document.getElementById("v-" + id).setAttribute("aria-pressed", String(id === v));
  }
  const r = fixture.viewRadiusM || 2.2;
  if (v === "top") {
    camera.position.set(center.x, center.y + r * 1.6, center.z + 0.001);
    controls.target.copy(center);
  } else if (v === "side") {
    camera.position.set(center.x, center.y + r * 0.25, center.z + r * 1.7);
    controls.target.copy(center);
  } else {
    camera.position.set(center.x + r, center.y + r * 0.8, center.z + r * 1.2);
    controls.target.copy(center);
  }
  controls.update();
  render();
}
function render() {
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
controls.addEventListener("change", render);
document.getElementById("v-iso").addEventListener("click", () => setView("iso"));
document.getElementById("v-top").addEventListener("click", () => setView("top"));
document.getElementById("v-side").addEventListener("click", () => setView("side"));

inspectEl.innerHTML = fixture.models.map((m) =>
  `<p><b>${m.id}</b> ${m.note || ""} @ [${m.positionM.join(", ")}]m yaw ${m.yawDeg || 0}°</p>`).join("") +
  `<p>views: iso/top/side via toolbar or ?view=; orbit with mouse.</p>`;
setView(["iso", "top", "side"].includes(view) ? view : "iso");
render();
const loadMs = Math.round(performance.now() - t0);
requestAnimationFrame(() => {
  const info = renderer.info;
  const res = performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".glb"));
  const bytes = res.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0);
  const names = res.map((r) => r.name.split("/").pop() + "=" + Math.round((r.encodedBodySize || r.transferSize || 0) / 1024) + "KB");
  statsEl.textContent =
    `load ${loadMs}ms · GLB requests ${res.length} · GLB bytes ${bytes} (${(bytes / 1048576).toFixed(2)}MB)\n` +
    names.join(" ") +
    `\ntriangles ${info.render.triangles} · draw calls ${info.render.calls} · geometries ${info.memory.geometries} · textures ${info.memory.textures}`;
  mount.dataset.section = "ready";
  mount.dataset.glbbytes = String(bytes);
  mount.dataset.triangles = String(info.render.triangles);
  mount.dataset.drawcalls = String(info.render.calls);
});
