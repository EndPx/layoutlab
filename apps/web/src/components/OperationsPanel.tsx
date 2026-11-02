// Operations Simulation mode panel: the static main-environment product view.
//
// Status band (fixture identity + honest not-running state), workspace with
// entity selection, the 3D warehouse viewport, an inspector for the selected
// entity, and collapsed developer diagnostics. Main-view labels stay
// operational; engineering data lives only in the diagnostics disclosure.
// No engine controls exist in this static part: nothing here moves, counts
// shipments, or stages activity.
import { useState } from "react";
import {
  loadOperationsScene,
  type OperationsScene,
  type OperationsSelection,
} from "../lib/operations";
import { OperationsView, type LabelLayer, type OpsRenderStats } from "./OperationsView";

function selectionDetail(scene: OperationsScene, selection: NonNullable<OperationsSelection>): React.JSX.Element {
  if (selection.kind === "location") {
    const l = scene.locations.find((x) => x.id === selection.id);
    if (!l) return <p>Unknown location.</p>;
    const product = l.productId ? scene.scenario.products.find((p) => p.id === l.productId) : undefined;
    return (
      <dl className="ops-facts">
        <div><dt>Slot</dt><dd>{l.id} · Rack {l.rackId} · Shelf deck {l.deck + 1} of 3</dd></div>
        <div><dt>Stored</dt><dd>{l.productId ? `${product?.label ?? l.productId} (${l.productId}) × ${l.quantity} items in ${l.containers.length} containers` : "Empty slot (zero stock)"}</dd></div>
        <div><dt>Pick approach</dt><dd>Aisle point ({l.approachMm.x}, {l.approachMm.z})</dd></div>
      </dl>
    );
  }
  if (selection.kind === "rack") {
    const slots = scene.locations.filter((l) => l.rackId === selection.id);
    const stocked = slots.filter((l) => l.productId);
    return (
      <dl className="ops-facts">
        <div><dt>Rack</dt><dd>{selection.id} · {slots.length} modeled slots · top deck bare (not counted)</dd></div>
        <div><dt>Slots</dt><dd>{stocked.map((l) => `${l.id} ${l.productId}×${l.quantity}`).join(" · ")}{slots.length > stocked.length ? " · L24 empty" : ""}</dd></div>
      </dl>
    );
  }
  if (selection.kind === "unit") {
    const u = scene.units.find((x) => x.id === selection.id);
    if (!u) return <p>Unknown unit.</p>;
    return (
      <dl className="ops-facts">
        <div><dt>Unit</dt><dd>{u.id} · {u.role} · parked, awaiting engine tasks</dd></div>
        <div><dt>Parking</dt><dd>Bay ({u.parkingMm.x}, {u.parkingMm.z})</dd></div>
      </dl>
    );
  }
  const r = scene.resources.find((x) => x.id === selection.id);
  if (!r) return <p>Unknown station.</p>;
  const kindLabel = r.kind === "receiving" ? "Receiving" : r.kind === "packing" ? "Packing" : "Dispatch";
  return (
    <dl className="ops-facts">
      <div><dt>Station</dt><dd>{r.id} · {kindLabel} · {r.serviceCapacity} service {r.serviceCapacity === 1 ? "lane" : "lanes"}</dd></div>
      <div><dt>Waiting bays</dt><dd>{r.queue.length} marked bays ({r.queue.map((q) => q.id).join(", ")}) · idle until the engine connects</dd></div>
    </dl>
  );
}

export function OperationsPanel(): React.JSX.Element {
  const [loaded] = useState<{ scene: OperationsScene } | { error: string }>(() => {
    try {
      return { scene: loadOperationsScene() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
  const [selection, setSelection] = useState<OperationsSelection>(null);
  const [labelLayer, setLabelLayer] = useState<LabelLayer>("areas");
  const [stats, setStats] = useState<OpsRenderStats | null>(null);

  if ("error" in loaded) {
    return (
      <div className="panel" data-testid="ops-panel">
        <h2>Operations Simulation</h2>
        <p role="alert" className="error">
          Environment failed to load: {loaded.error}. No warehouse is shown; the Storage Planning mode is unaffected.
        </p>
      </div>
    );
  }
  const scene = loaded.scene;

  const c = scene.counts;
  const selectValue = selection ? `${selection.kind}:${selection.id}` : "";

  return (
    <div data-testid="ops-panel">
      <div className="ops-status" data-testid="ops-status">
        <span className="badge badge-info">ENVIRONMENT READY · OPERATIONS CONNECTION PENDING</span>
        <span className="mono">
          {scene.scenario.id} · {c.racks} racks · {c.locations} slots · {c.products} products · {c.units} units · {c.orders + c.deliveries} scheduled orders/deliveries · engine {scene.scenario.engineVersion}
        </span>
        <span className="hint">Static configured scene: values shown are initial/configured. Movement, queues, and stock changes arrive with the engine slice.</span>
      </div>
      <div className="ops-workspace">
        <div className="panel" data-testid="ops-entities">
          <h2>Warehouse entities</h2>
          <label>
            Selected entity
            <select
              data-testid="ops-select"
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setSelection(null);
                  return;
                }
                const [kind, id] = v.split(":");
                if ((kind === "location" || kind === "rack" || kind === "unit" || kind === "resource") && id) {
                  setSelection({ kind, id });
                }
              }}
            >
              <option value="">None</option>
              <optgroup label="Storage slots">
                {scene.locations.map((l) => (
                  <option key={l.id} value={`location:${l.id}`}>
                    {l.id} · {l.productId ? `${l.productId} ×${l.quantity}` : "empty"}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Racks">
                {scene.racks.map((r) => (
                  <option key={r.id} value={`rack:${r.id}`}>{r.id}</option>
                ))}
              </optgroup>
              <optgroup label="Mobile units">
                {scene.units.map((u) => (
                  <option key={u.id} value={`unit:${u.id}`}>{u.id} · {u.role}</option>
                ))}
              </optgroup>
              <optgroup label="Stations">
                {scene.resources.map((r) => (
                  <option key={r.id} value={`resource:${r.id}`}>{r.id} · {r.kind}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Label layer">
            {(["areas", "slots", "all"] as LabelLayer[]).map((layer) => (
              <button
                key={layer}
                type="button"
                aria-pressed={labelLayer === layer}
                className={labelLayer === layer ? "on" : ""}
                onClick={() => setLabelLayer(layer)}
                data-testid={`ops-labels-${layer}`}
              >
                {layer === "areas" ? "Areas" : layer === "slots" ? "Slots" : "All"}
              </button>
            ))}
          </div>
          <p className="hint">Labels: area identities (racks, stations, units, entrances) or all 24 storage slots. Selection markers and chips follow the entity.</p>
        </div>
        <div className="panel ops-viewport" data-testid="ops-viewport-panel">
          <div className="warehouse-head">
            <h2>Warehouse</h2>
            <span className="proxy-ribbon">SOURCED GEOMETRY · STATIC</span>
          </div>
          <OperationsView scene={scene} selection={selection} labelLayer={labelLayer} onStats={setStats} />
        </div>
        <div className="panel" data-testid="ops-inspector">
          <h2>Inspector</h2>
          {selection ? (
            selectionDetail(scene, selection)
          ) : (
            <p className="hint">Select a storage slot, rack, mobile unit, or station to inspect its configured state. Use Inspect in the viewport to frame it.</p>
          )}
        </div>
      </div>
      <details className="panel ops-diagnostics" data-testid="ops-diagnostics">
        <summary>
          Developer diagnostics: dimensions, assets, renderer counts ({c.containers} containers · {stats ? `${stats.drawCalls} draws · ${(stats.triangles / 1_000_000).toFixed(1)}M tris` : "render pending"})
        </summary>
        <div className="mono ops-diag-grid">
          <section>
            <h3>Fixture</h3>
            <p>fixtures/operations/main-warehouse.json · {scene.scenario.id} · schema {scene.scenario.schemaVersion}</p>
            <p>Room {scene.roomMm.width}×{scene.roomMm.depth} mm · racks {c.racks} · slots {c.locations} · products {c.products} · stock entries {c.stockEntries} · units {c.units} · resources {c.resources} · orders {c.orders} · deliveries {c.deliveries} · obstacles {c.obstacles}</p>
            <p>Seed {scene.scenario.seed} · run {scene.scenario.policies.run.mode} {scene.scenario.policies.run.mode === "fixed-window" ? scene.scenario.policies.run.horizonMs : scene.scenario.policies.run.arrivalCutoffMs} ms</p>
          </section>
          <section>
            <h3>Assets</h3>
            <ul>
              {(stats?.assets ?? []).map((a) => (
                <li key={a.url}>{a.url} — {a.status}{a.status !== "loaded" ? ` (${a.detail})` : ""}</li>
              ))}
              {(!stats || stats.assets.length === 0) && <li>Asset load in progress…</li>}
            </ul>
            <p>Containers: {scene.containerGlbs.map((g) => `${g.asset.split("/")[1]} ×${g.count}`).join(" · ")}</p>
            <p>Materials: documented replacement colors baked into each GLB (concrete, rack blue-gray, cardboard tan, crate blue, packing green, cart orange); source MDL/textures unsupported, UVs lost — appearance not claimed retained.</p>
          </section>
          <section>
            <h3>Renderer</h3>
            <p>{stats ? `Triangles ${stats.triangles} · draw calls ${stats.drawCalls} · geometries ${stats.geometries} · load ${stats.loadMs ?? "…"} ms` : "Render pending."}</p>
            <p>Custom annotations (not sourced geometry): room outline, staging outlines + wash, waiting discs, service octahedra, parking outlines, selected-approach marker, text chips + leader lines, 2.5 m shell cutaway.</p>
            <p>Load errors, if any, appear in the viewport status line and above; failed assets render nothing (no silent proxy cubes).</p>
          </section>
        </div>
      </details>
    </div>
  );
}
