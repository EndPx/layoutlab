import { CURRENT_IMPLEMENTATION_VERSION, ARCHIVED_RUNTIMES } from '../runtime-selector.js';
import { verifyLayoutComparison, type LayoutComparisonVerification } from './compare.js';
import { verifyRackLayoutComparison } from './rack.js';
import { verifyRackRotationComparison } from './rack-rotation.js';
import { verifyAgentPlacementComparison } from './agent-placement.js';

const current = {
  'layoutlab.layout-comparison/2': verifyLayoutComparison,
  'layoutlab.rack-comparison/1': verifyRackLayoutComparison,
  'layoutlab.rack-rotation-comparison/1': verifyRackRotationComparison,
  'layoutlab.agent-placement-comparison/1': verifyAgentPlacementComparison,
};
export type LayoutVerificationForVersion = Partial<LayoutComparisonVerification> & {
  ok: boolean;
  mismatches: string[];
  verifierImplementationVersion: string | null;
};

/** Replay the original envelope without modifying recorded inputs or measurements. */
export async function verifyLayoutReportForVersion(report: unknown): Promise<LayoutVerificationForVersion> {
  const envelope = report as { schema?: unknown; versions?: { simulation?: unknown } } | null;
  const schema = envelope?.schema;
  const version = envelope?.versions?.simulation;
  if (typeof schema !== 'string' || !Object.hasOwn(current, schema) || version !== '0.1.1') {
    return { ok: false, mismatches: ['unsupported layout schema/version pair'], verifierImplementationVersion: null };
  }
  const archived = ARCHIVED_RUNTIMES['0.1.1'];
  const historical = {
    'layoutlab.layout-comparison/2': archived.verifyLayoutComparison,
    'layoutlab.rack-comparison/1': archived.verifyRackLayoutComparison,
    'layoutlab.rack-rotation-comparison/1': archived.verifyRackRotationComparison,
    'layoutlab.agent-placement-comparison/1': archived.verifyAgentPlacementComparison,
  };
  const verifier = (version === CURRENT_IMPLEMENTATION_VERSION ? current : historical)[schema as keyof typeof current];
  try {
    const result = await verifier(report as never);
    return { ...(typeof result === 'boolean' ? { ok: result, mismatches: result ? [] : ['layout replay mismatch'] } : result), verifierImplementationVersion: version };
  } catch {
    return { ok: false, mismatches: ['layout replay failed'], verifierImplementationVersion: version };
  }
}
