import type { Assignment, Scenario } from "@layoutlab/core";
import { CenterView, type RoutePolyline } from "./CenterView";
import { ThreeView } from "./ThreeView";

export type ViewMode = "2d" | "3d";

// Center column: the dominant warehouse viewport. Presentation only — every
// control here changes the view, never scenario state.
export function WarehousePanel(props: {
  scenario: Scenario | null;
  displayedAssignment: Assignment[] | null;
  selectedStubName: string | null;
  hasCandidate: boolean;
  showSelected: boolean;
  onShowSelected: (show: boolean) => void;
  selectedOrderId: string | null;
  onSelectOrder: (id: string | null) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  currentRoute: RoutePolyline | null;
  candidateRoute: RoutePolyline | null;
  showCurrentRoute: boolean;
  onShowCurrentRoute: (show: boolean) => void;
  showCandidateRoute: boolean;
  onShowCandidateRoute: (show: boolean) => void;
  originAssignment: Assignment[];
  currentEdited: boolean;
  currentNote: string | null;
}): React.JSX.Element {
  const {
    scenario, displayedAssignment, selectedStubName, hasCandidate,
    showSelected, onShowSelected, selectedOrderId, onSelectOrder,
    viewMode, onViewMode, currentRoute, candidateRoute,
    showCurrentRoute, onShowCurrentRoute, showCandidateRoute, onShowCandidateRoute,
    originAssignment, currentEdited, currentNote,
  } = props;
  if (!scenario || !displayedAssignment) {
    return (
      <div className="panel" data-testid="warehouse-panel">
        <h2>Warehouse</h2>
        <p>Load the sample or a bounded JSON scenario to begin.</p>
      </div>
    );
  }
  return (
    <div className="panel" data-testid="warehouse-panel">
      <div className="warehouse-head">
        <h2>Warehouse</h2>
        <div className="segmented" role="group" aria-label="View mode">
          <button type="button" aria-pressed={viewMode === "2d"} className={viewMode === "2d" ? "on" : ""} onClick={() => onViewMode("2d")} data-testid="view-tab-2d">2D</button>
          <button type="button" aria-pressed={viewMode === "3d"} className={viewMode === "3d" ? "on" : ""} onClick={() => onViewMode("3d")} data-testid="view-tab-3d">3D</button>
        </div>
        <div className="segmented" role="group" aria-label="Assignment frame">
          <button
            type="button"
            aria-pressed={!showSelected}
            className={!showSelected ? "on" : ""}
            onClick={() => onShowSelected(false)}
            data-testid="frame-current"
          >
            Current
          </button>
          <button
            type="button"
            aria-pressed={showSelected}
            className={showSelected ? "on" : ""}
            onClick={() => onShowSelected(true)}
            disabled={!hasCandidate}
            title={hasCandidate ? `Show selected candidate ${selectedStubName ?? ""}` : "Select a candidate below to compare frames"}
            data-testid="toggle-candidate-view"
          >
            Candidate
          </button>
        </div>
      </div>
      <p className="hint" data-testid="frame-source">
        {showSelected && hasCandidate
          ? `Showing candidate ${selectedStubName ?? ""} assignments; the current assignment is unchanged.`
          : "Showing the current assignment."}
      </p>
      {currentEdited && (
        <p className="hint" data-testid="frame-edited-note">
          The live scene differs from the run baseline; the orange route follows the live scene.
        </p>
      )}
      <div className="viewbox" data-testid="view-2d" hidden={viewMode !== "2d"}>
        <CenterView
          scenario={scenario}
          assignment={displayedAssignment}
          baselineAssignment={originAssignment}
          currentRoute={currentRoute}
          candidateRoute={candidateRoute}
          showCurrent={showCurrentRoute}
          showCandidate={showCandidateRoute}
          currentNote={currentNote}
        />
      </div>
      <div className="viewbox" data-testid="view-3d" hidden={viewMode !== "3d"}>
        <span className="proxy-ribbon">SIMREADY RACKS · PROXY MARKERS</span>
        <ThreeView
          scenario={scenario}
          assignment={displayedAssignment}
          currentRoute={currentRoute}
          candidateRoute={candidateRoute}
          showCurrent={showCurrentRoute}
          showCandidate={showCandidateRoute}
          active={viewMode === "3d"}
        />
      </div>
      <div className="warehouse-foot">
        <label>
          Selected order
          <select
            data-testid="select-order"
            value={selectedOrderId ?? ""}
            onChange={(e) => onSelectOrder(e.target.value || null)}
          >
            {scenario.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · Products {o.lines.map((l) => l.productId).join(", ")} (×{o.frequency})
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showCandidateRoute}
            onChange={(e) => onShowCandidateRoute(e.target.checked)}
            data-testid="toggle-route"
          />{" "}
          Route
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showCurrentRoute}
            onChange={(e) => onShowCurrentRoute(e.target.checked)}
            data-testid="toggle-previous-route"
          />{" "}
          Previous route
        </label>
        <span className="legend" data-testid="route-legend" aria-label="Route legend">
          <span><i className="swatch candidate" aria-hidden="true" /> Candidate</span>
          <span><i className="swatch current" aria-hidden="true" /> {currentEdited ? "Current (edited scene)" : "Current"}</span>
        </span>
        <span className="legend" data-testid="demand-legend" aria-label="Demand legend">
          <span><span className="dot low" />○ Low</span>
          <span><span className="dot mid" />◐ Mid</span>
          <span><span className="dot high" />● High</span>
        </span>
        <span className="hint">Fixed racks · Conservative 2D routing</span>
      </div>
    </div>
  );
}
