import { rackFootprint, type Assignment, type Scenario } from "@layoutlab/core";

export function CenterView(props: {
  scenario: Scenario;
  assignment: Assignment[];
  baselineAssignment: Assignment[];
  route: { points: { x: number; z: number }[] } | null;
  hasRoute: boolean;
}): React.JSX.Element {
  const { scenario, assignment, baselineAssignment, route, hasRoute } = props;
  const W = scenario.room.widthMm;
  const D = scenario.room.depthMm;
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
  const pts = route ? route.points.map((p) => `${p.x},${p.z}`).join(" ") : "";

  return (
    <div>
      {!hasRoute && (
        <p className="notice" data-testid="route-fallback">
          Visit-order schematic — not collision-checked (route unavailable for this selection).
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${D}`}
        width="100%"
        role="img"
        aria-label={`2D warehouse plan, room ${W} by ${D} millimeters`}
        data-testid="svg-2d"
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
        {route && (
          <polyline
            points={pts}
            fill="none"
            stroke="#0e6e6e"
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
          fill="#0e6e6e"
        />
        <text x={scenario.packingPointMm.x} y={scenario.packingPointMm.z - 220} textAnchor="middle" fontSize={280} fill="#0e6e6e">
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
        {route ? `True collision-checked route polyline, ${route.points.length} points.` : "No route polyline for this order/selection."}
      </p>
    </div>
  );
}
