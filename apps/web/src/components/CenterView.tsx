import { useRef, useState } from "react";
import { rackFootprint, type Assignment, type Scenario } from "@layoutlab/core";

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
}): React.JSX.Element {
  const { scenario, assignment, baselineAssignment, currentRoute, candidateRoute, showCurrent, showCandidate, currentNote } = props;
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
  const prodAt = new Map<string, string>();
  for (const [pid, lid] of locOf) prodAt.set(lid, pid);

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
              <text x={(f.minX + f.maxX) / 2} y={(f.minZ + f.maxZ) / 2} textAnchor="middle" fontSize={320} fill="#1a2333">
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
        {scenario.locations.map((l, idx) => {
          const pid = prodAt.get(l.id);
          const isTo = movedTo.has(l.id);
          const isFrom = movedFrom.has(l.id) && !isTo;
          // Stagger label sides so close pairs (L1/L3, L5/L7) stay legible.
          const side = idx % 4 < 2 ? -1 : 1;
          const lx = l.pickPointMm.x + side * 520;
          return (
            <g key={l.id}>
              <circle
                cx={l.pickPointMm.x}
                cy={l.pickPointMm.z}
                r={isTo || isFrom ? 260 : 170}
                fill={isTo ? "#123a9e" : isFrom ? "#ffffff" : "#7aa5ff"}
                stroke="#1a2333"
                strokeWidth={isTo || isFrom ? 90 : 50}
                strokeDasharray={isFrom ? "160 120" : undefined}
                data-testid={`loc-${l.id}`}
              />
              <line
                x1={l.pickPointMm.x}
                y1={l.pickPointMm.z - 170}
                x2={lx}
                y2={l.pickPointMm.z - 330}
                stroke="#4a5568"
                strokeWidth={30}
              />
              <text x={lx} y={l.pickPointMm.z - 360} textAnchor="middle" fontSize={230} fill="#1a2333">
                {l.id}
              </text>
              <text x={lx} y={l.pickPointMm.z - 110} textAnchor="middle" fontSize={200} fill="#4a5568">
                {pid ?? "empty"}
              </text>
              {isTo && (
                <text x={l.pickPointMm.x} y={l.pickPointMm.z + 560} textAnchor="middle" fontSize={240} fill="#123a9e">
                  TO
                </text>
              )}
              {isFrom && (
                <text x={l.pickPointMm.x} y={l.pickPointMm.z + 560} textAnchor="middle" fontSize={240} fill="#4a5568">
                  FROM
                </text>
              )}
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
