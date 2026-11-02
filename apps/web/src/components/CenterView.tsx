import { useRef, useState } from "react";
import { rackFootprint, type Assignment, type Scenario } from "@layoutlab/core";
import type { ProductPlacement, StorageAnchor } from "../lib/storageAnchors";

export type RoutePolyline = { points: { x: number; z: number }[] };

type Camera = { scale: number; cx: number; cz: number };

function samePoints(a: RoutePolyline, b: RoutePolyline): boolean {
  if (a.points.length !== b.points.length) return false;
  return a.points.every((p, i) => p.x === b.points[i]!.x && p.z === b.points[i]!.z);
}

export function CenterView(props: {
  scenario: Scenario;
  assignment: Assignment[];
  baselineAssignment: Assignment[];
  currentRoute: RoutePolyline | null;
  candidateRoute: RoutePolyline | null;
  showCurrent: boolean;
  showCandidate: boolean;
  currentNote: string | null;
  anchors: Map<string, StorageAnchor>;
  placements: ProductPlacement[];
  selectedLocationId: string | null;
  selectedProductId: string | null;
  visibleApproachIds: string[];
}): React.JSX.Element {
  const { scenario, assignment, baselineAssignment, currentRoute, candidateRoute, showCurrent, showCandidate, currentNote } = props;
  const { anchors, placements, selectedLocationId, selectedProductId, visibleApproachIds } = props;
  const W = scenario.room.widthMm;
  const D = scenario.room.depthMm;
  const [cam, setCam] = useState<Camera>({ scale: 1, cx: W / 2, cz: D / 2 });
  const dragRef = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const locOf = new Map(assignment.map((a) => [a.productId, a.locationId]));
  const baseOf = new Map(baselineAssignment.map((a) => [a.productId, a.locationId]));
  const movedTo = new Set<string>();
  const movedFrom = new Set<string>();
  for (const [pid, lid] of locOf) {
    if (baseOf.get(pid) !== lid) {
      movedTo.add(lid);
      const from = baseOf.get(pid);
      if (from) movedFrom.add(from);
    }
  }
  // Every occupant listed (duplicates included); never a Map overwrite.
  const prodsAt = new Map<string, ProductPlacement[]>();
  for (const p of placements) {
    const list = prodsAt.get(p.locationId) ?? [];
    list.push(p);
    prodsAt.set(p.locationId, list);
  }
  const anchorsByRack = new Map<string, StorageAnchor[]>();
  for (const a of anchors.values()) {
    const list = anchorsByRack.get(a.rackId) ?? [];
    list.push(a);
    anchorsByRack.set(a.rackId, list);
  }
  const visibleApproach = new Set(visibleApproachIds);

  const drawnCurrent = showCurrent ? currentRoute : null;
  const drawnCandidate = showCandidate ? candidateRoute : null;
  const coincide = drawnCurrent !== null && drawnCandidate !== null && samePoints(drawnCurrent, drawnCandidate);
  const anyRoute = drawnCurrent !== null || drawnCandidate !== null;

  const vw = W / cam.scale;
  const vh = D / cam.scale;
  const vx = cam.cx - vw / 2;
  const vy = cam.cz - vh / 2;
  const zoomBy = (f: number): void =>
    setCam((c) => ({ ...c, scale: Math.min(8, Math.max(0.5, c.scale * f)) }));
  const resetCam = (): void => setCam({ scale: 1, cx: W / 2, cz: D / 2 });
  const panBy = (dxMm: number, dzMm: number): void =>
    setCam((c) => ({ ...c, cx: c.cx + dxMm, cz: c.cz + dzMm }));
  const pxToMm = (): number => {
    const el = svgRef.current;
    if (!el) return vw / 600;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? vw / r.width : vw / 600;
  };

  const pts = (r: RoutePolyline): string => r.points.map((p) => `${p.x},${p.z}`).join(" ");

  return (
    <div>
      <div className="camrow" role="group" aria-label="2D camera controls">
        <button type="button" onClick={() => zoomBy(1.25)} data-testid="view-2d-zoom-in" aria-label="Zoom 2D in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} data-testid="view-2d-zoom-out" aria-label="Zoom 2D out">−</button>
        <button type="button" onClick={resetCam} data-testid="view-2d-reset" aria-label="Reset 2D view">⟳</button>
        <span className="hint">Drag or arrow keys pan; view only, racks never move.</span>
      </div>
      {!anyRoute && (
        <p className="notice" data-testid="route-fallback">
          Visit-order schematic — not collision-checked (route unavailable for this selection).
        </p>
      )}
      {coincide && (
        <p className="notice" data-testid="route-coincide">
          Current and candidate routes coincide for this order.
        </p>
      )}
      <svg
        ref={svgRef}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        width="100%"
        role="img"
        tabIndex={0}
        aria-label={`2D warehouse plan, room ${W} by ${D} millimeters`}
        data-testid="svg-2d"
        data-zoom={cam.scale.toFixed(2)}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          dragRef.current = { x: e.clientX, y: e.clientY, cx: cam.cx, cz: cam.cz };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || e.buttons === 0) return;
          const k = pxToMm();
          setCam((c) => ({ ...c, cx: d.cx - (e.clientX - d.x) * k, cz: d.cz - (e.clientY - d.y) * k }));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onKeyDown={(e) => {
          const step = vw / 8;
          if (e.key === "ArrowLeft") { panBy(-step, 0); e.preventDefault(); }
          else if (e.key === "ArrowRight") { panBy(step, 0); e.preventDefault(); }
          else if (e.key === "ArrowUp") { panBy(0, -step); e.preventDefault(); }
          else if (e.key === "ArrowDown") { panBy(0, step); e.preventDefault(); }
          else if (e.key === "+" || e.key === "=") { zoomBy(1.25); e.preventDefault(); }
          else if (e.key === "-") { zoomBy(1 / 1.25); e.preventDefault(); }
          else if (e.key === "0") { resetCam(); e.preventDefault(); }
        }}
      >
        <rect x={0} y={0} width={W} height={D} fill="#fbfcfe" stroke="#1a2333" strokeWidth={40} />
        {scenario.racks.map((r) => {
          const f = rackFootprint(r);
          const slots = anchorsByRack.get(r.id) ?? [];
          return (
            <g key={r.id}>
              <rect
                x={f.minX}
                y={f.minZ}
                width={f.maxX - f.minX}
                height={f.maxZ - f.minZ}
                fill="#e3e8f0"
                stroke="#1a2333"
                strokeWidth={50}
              />
              {slots.map((a) => {
                const s = a.slotRectMm;
                const selected = a.locationId === selectedLocationId;
                return (
                  <rect
                    key={a.locationId}
                    x={s.minX}
                    y={s.minZ}
                    width={s.maxX - s.minX}
                    height={s.maxZ - s.minZ}
                    fill="#ffffff"
                    stroke={selected ? "#0b6b6e" : "#4a5568"}
                    strokeWidth={selected ? 70 : 35}
                    strokeDasharray="140 90"
                    data-testid={`slot-${a.locationId}`}
                    data-anchor={`${a.centerMm.x},${a.centerMm.z},${a.baseYMm}`}
                  />
                );
              })}
              <text
                x={(f.minX + f.maxX) / 2}
                y={(f.minZ + f.maxZ) / 2}
                textAnchor="middle"
                fontSize={300}
                fill="#1a2333"
                stroke="#ffffff"
                strokeWidth={60}
                paintOrder="stroke"
              >
                {r.id}
              </text>
            </g>
          );
        })}
        {drawnCurrent && (
          <polyline
            points={pts(drawnCurrent)}
            fill="none"
            stroke="#d9730d"
            strokeWidth={90}
            strokeLinejoin="round"
            strokeDasharray="360 240"
            data-testid="route-polyline-current"
          />
        )}
        {drawnCandidate && (
          <polyline
            points={pts(drawnCandidate)}
            fill="none"
            stroke="#0b6b6e"
            strokeWidth={90}
            strokeLinejoin="round"
            data-testid="route-polyline"
          />
        )}
        <rect
          x={scenario.packingPointMm.x - 160}
          y={scenario.packingPointMm.z - 160}
          width={320}
          height={320}
          fill="#0b6b6e"
        />
        <text x={scenario.packingPointMm.x} y={scenario.packingPointMm.z - 220} textAnchor="middle" fontSize={280} fill="#0b6b6e">
          PACK
        </text>
        {scenario.locations.map((l) => {
          const anchor = anchors.get(l.id);
          const occupants = prodsAt.get(l.id) ?? [];
          const isTo = movedTo.has(l.id);
          const isFrom = movedFrom.has(l.id) && !isTo;
          const selected = l.id === selectedLocationId;
          const showApproach = visibleApproach.has(l.id);
          // Locations without a valid storage pose render no slot geometry;
          // the diagnostics panel names them (never a fabricated pose).
          if (!anchor) {
            if (!showApproach) return null;
            return (
              <g key={l.id}>
                <circle
                  cx={l.pickPointMm.x}
                  cy={l.pickPointMm.z}
                  r={220}
                  fill="#ffffff"
                  stroke="#b42318"
                  strokeWidth={70}
                  strokeDasharray="140 90"
                  data-testid={`approach-${l.id}`}
                  data-pick={`${l.pickPointMm.x},${l.pickPointMm.z}`}
                />
                <text x={l.pickPointMm.x} y={l.pickPointMm.z + 560} textAnchor="middle" fontSize={230} fill="#b42318">
                  {l.id} ! no storage pose
                </text>
              </g>
            );
          }
          const cx = anchor.centerMm.x;
          const cz = anchor.centerMm.z;
          // Alternate labels above/below the slot by slot parity: neighboring
          // slots (800mm apart) never share a label row, so nothing collides.
          const above = anchor.slotIndex % 2 === 0;
          const ly1 = above ? cz - 950 : cz + 700;
          const ly2 = above ? cz - 700 : cz + 950;
          const label = occupants.length > 0 ? occupants.map((o) => o.productId).join(",") : "empty";
          return (
            <g key={l.id}>
              {occupants.map((o) => {
                // Invalid stacks offset display-only so every occupant stays
                // visible at true size; the anchor itself never moves.
                const ox = o.occupantIndex * 150;
                const oz = o.occupantIndex * 150;
                const r = o.loadRectMm;
                const isSel = o.productId === selectedProductId;
                const bad = !o.fits || o.occupantCount > 1;
                return (
                  <rect
                    key={`${o.productId}@${o.occupantIndex}`}
                    x={r.minX + ox}
                    y={r.minZ + oz}
                    width={r.maxX - r.minX}
                    height={r.maxZ - r.minZ}
                    fill={bad ? "#fdeceb" : isSel ? "#e6f4f4" : "#d7e3f4"}
                    stroke={bad ? "#b42318" : isSel ? "#0b6b6e" : "#1a2333"}
                    strokeWidth={bad || isSel ? 70 : 40}
                    strokeDasharray={bad ? "140 90" : undefined}
                    data-testid={`stored-${o.productId}`}
                    data-location={o.locationId}
                    data-anchor={`${cx},${cz},${anchor.baseYMm}`}
                  />
                );
              })}
              {showApproach && (
                <line
                  x1={l.pickPointMm.x}
                  y1={l.pickPointMm.z}
                  x2={cx}
                  y2={cz}
                  stroke="#4a5568"
                  strokeWidth={30}
                  strokeDasharray="120 100"
                />
              )}
              {showApproach && (
                <circle
                  cx={l.pickPointMm.x}
                  cy={l.pickPointMm.z}
                  r={selected ? 220 : 170}
                  fill={selected ? "#0b6b6e" : "#ffffff"}
                  stroke="#1a2333"
                  strokeWidth={selected ? 80 : 50}
                  data-testid={`approach-${l.id}`}
                  data-pick={`${l.pickPointMm.x},${l.pickPointMm.z}`}
                />
              )}
              <line
                x1={cx}
                y1={above ? cz - 170 : cz + 170}
                x2={cx}
                y2={above ? ly2 : ly1}
                stroke="#4a5568"
                strokeWidth={30}
              />
              <text x={cx} y={ly1} textAnchor="middle" fontSize={230} fill="#1a2333">
                {l.id}{selected ? " ◆Selected" : ""}{isTo ? " · TO" : ""}{isFrom ? " · FROM" : ""}
              </text>
              <text x={cx} y={ly2} textAnchor="middle" fontSize={200} fill="#4a5568">
                {label}{occupants.length > 1 ? ` ⚠×${occupants.length}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mono" data-testid="route-meta">
        {drawnCurrent ? `Current route${currentNote ? ` (${currentNote})` : ""}: true collision-checked polyline, ${drawnCurrent.points.length} points. ` : "No current route for this order/selection. "}
        {drawnCandidate ? `Candidate route: true collision-checked polyline, ${drawnCandidate.points.length} points.` : "No candidate route for this order/selection."}
      </p>
    </div>
  );
}
