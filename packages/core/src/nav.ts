import { segmentBlocked } from "./geometry.js";
import type { PointMm, Scenario } from "./schema.js";
import { pointNavigable, type NavContext } from "./scene.js";
import { GRID_SIZE_MM } from "./version.js";

// Navigation graph nodes sit at 100 mm multiples, so on-grid hand values
// stay exact. Node (i, j) is the floor point (i*100, j*100).
export type GridNode = { i: number; j: number };

// Endpoints map to graph nodes within this radius; anything farther is
// unreachable rather than teleported.
export const CONNECTION_RADIUS_MM = 2000;

// Aggregate evaluation caps (MVP scenes use ~4k nodes; these give wide
// headroom while failing fast on pathological inputs).
export const MAX_GRID_NODES = 250_000;
export const MAX_WORKLOAD_EXPANSIONS = 200_000;

export class BudgetExhausted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExhausted";
  }
}

export type NavBudget = { remainingExpansions: number };

export function createNavBudget(maxExpansions: number = MAX_WORKLOAD_EXPANSIONS): NavBudget {
  return { remainingExpansions: maxExpansions };
}

export function gridNodeCount(nav: NavContext): number {
  return (nav.cols + 1) * (nav.rows + 1);
}

export function nodePoint(node: GridNode): PointMm {
  return { x: node.i * GRID_SIZE_MM, z: node.j * GRID_SIZE_MM };
}

function nodeFree(node: GridNode, scenario: Scenario, nav: NavContext): boolean {
  if (node.i < 0 || node.j < 0 || node.i > nav.cols || node.j > nav.rows) return false;
  return pointNavigable(nodePoint(node), scenario, nav);
}

export type EndpointConnection = { node: GridNode; connectorMm: number };

// Deterministic endpoint connection: nearest free node (by squared distance,
// then row, then column) whose straight segment from the endpoint is
// collision-free. Connector length is ceil(Euclidean), so it never
// understates; on-node endpoints get connector 0. Endpoints that violate
// clearance never connect.
export function connectEndpoint(
  p: PointMm,
  scenario: Scenario,
  nav: NavContext,
): EndpointConnection | null {
  if (!pointNavigable(p, scenario, nav)) return null;
  const r = CONNECTION_RADIUS_MM;
  const iMin = Math.max(0, Math.ceil((p.x - r) / GRID_SIZE_MM));
  const iMax = Math.min(nav.cols, Math.floor((p.x + r) / GRID_SIZE_MM));
  const jMin = Math.max(0, Math.ceil((p.z - r) / GRID_SIZE_MM));
  const jMax = Math.min(nav.rows, Math.floor((p.z + r) / GRID_SIZE_MM));
  const candidates: { node: GridNode; d2: number }[] = [];
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const n = nodePoint({ i, j });
      const d2 = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d2 <= r * r) candidates.push({ node: { i, j }, d2 });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.node.j - b.node.j || a.node.i - b.node.i);
  for (const { node, d2 } of candidates) {
    if (!nodeFree(node, scenario, nav)) continue;
    if (segmentBlocked(p, nodePoint(node), nav.inflatedObstacles)) continue;
    return { node, connectorMm: Math.ceil(Math.sqrt(d2)) };
  }
  return null;
}

type HeapNode = { i: number; j: number; f: number; h: number; g: number };

function lessNode(a: HeapNode, b: HeapNode): boolean {
  // Fixed tie-break: f, then h, then row (z), then column (x).
  if (a.f !== b.f) return a.f < b.f;
  if (a.h !== b.h) return a.h < b.h;
  if (a.j !== b.j) return a.j < b.j;
  return a.i < b.i;
}

function heapPush(heap: HeapNode[], node: HeapNode): void {
  heap.push(node);
  let k = heap.length - 1;
  while (k > 0) {
    const parent = (k - 1) >> 1;
    if (lessNode(heap[k] as HeapNode, heap[parent] as HeapNode)) {
      [heap[k], heap[parent]] = [heap[parent] as HeapNode, heap[k] as HeapNode];
      k = parent;
    } else break;
  }
}

function heapPop(heap: HeapNode[]): HeapNode | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last !== undefined) {
    heap[0] = last;
    let k = 0;
    for (;;) {
      const left = 2 * k + 1;
      const right = 2 * k + 2;
      let smallest = k;
      if (left < heap.length && lessNode(heap[left] as HeapNode, heap[smallest] as HeapNode)) {
        smallest = left;
      }
      if (right < heap.length && lessNode(heap[right] as HeapNode, heap[smallest] as HeapNode)) {
        smallest = right;
      }
      if (smallest === k) break;
      [heap[k], heap[smallest]] = [heap[smallest] as HeapNode, heap[k] as HeapNode];
      k = smallest;
    }
  }
  return top;
}

// Four-neighbor A* with Manhattan heuristic. Returns grid path length in mm,
// or null when no path exists. Each node expands at most once (closed set);
// the shared budget bounds total work across a whole workload evaluation.
export function astarNodeDistanceMm(
  start: GridNode,
  goal: GridNode,
  scenario: Scenario,
  nav: NavContext,
  budget: NavBudget,
): number | null {
  if (start.i === goal.i && start.j === goal.j) return 0;
  const count = gridNodeCount(nav);
  if (count > MAX_GRID_NODES) {
    throw new BudgetExhausted(`grid has ${count} nodes, cap is ${MAX_GRID_NODES}`);
  }
  const stride = nav.cols + 1;
  const key = (i: number, j: number): number => j * stride + i;
  const gScore = new Array<number>(count).fill(Infinity);
  const closed = new Array<boolean>(count).fill(false);
  gScore[key(start.i, start.j)] = 0;
  const h0 = Math.abs(goal.i - start.i) + Math.abs(goal.j - start.j);
  const heap: HeapNode[] = [{ i: start.i, j: start.j, f: h0, h: h0, g: 0 }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (heap.length > 0) {
    if (budget.remainingExpansions <= 0) {
      throw new BudgetExhausted("workload A* expansion budget exhausted");
    }
    budget.remainingExpansions -= 1;
    const current = heapPop(heap) as HeapNode;
    const ck = key(current.i, current.j);
    if (closed[ck]) continue;
    closed[ck] = true;
    if (current.i === goal.i && current.j === goal.j) {
      return current.g * GRID_SIZE_MM;
    }
    for (const [di, dj] of dirs) {
      const ni = current.i + (di as number);
      const nj = current.j + (dj as number);
      if (ni < 0 || nj < 0 || ni > nav.cols || nj > nav.rows) continue;
      const nk = key(ni, nj);
      if (closed[nk]) continue;
      const center = nodePoint({ i: ni, j: nj });
      if (!pointNavigable(center, scenario, nav)) continue;
      // Edge validation: adjacent free nodes can still clip a corner.
      if (segmentBlocked(nodePoint(current), center, nav.inflatedObstacles)) continue;
      const g = current.g + 1;
      if (g < (gScore[nk] as number)) {
        gScore[nk] = g;
        const h = Math.abs(goal.i - ni) + Math.abs(goal.j - nj);
        heapPush(heap, { i: ni, j: nj, f: g + h, h, g });
      }
    }
  }
  return null;
}

// Measured path between two floor points in mm:
//   connector(a) + grid steps * 100 + connector(b)
// Identical navigable points measure 0; null means no path exists (never
// budget exhaustion, which throws BudgetExhausted instead).
export function shortestPathMm(
  a: PointMm,
  b: PointMm,
  scenario: Scenario,
  nav: NavContext,
  budget: NavBudget = createNavBudget(),
): number | null {
  if (a.x === b.x && a.z === b.z) {
    return pointNavigable(a, scenario, nav) ? 0 : null;
  }
  const ca = connectEndpoint(a, scenario, nav);
  const cb = connectEndpoint(b, scenario, nav);
  if (ca === null || cb === null) return null;
  const grid = astarNodeDistanceMm(ca.node, cb.node, scenario, nav, budget);
  if (grid === null) return null;
  return ca.connectorMm + grid + cb.connectorMm;
}
