import { describe, it, expect } from 'vitest';
import { ARCHIVED_RUNTIMES, CURRENT_IMPLEMENTATION_VERSION, createOperationsControllerForVersion, recomputeOperationsReportForVersion, verifyOperationsExperimentForVersion } from '../src/runtime-selector.js';
import * as archive010 from '../archive/0.1.0/runtime.mjs';
import * as archive011 from '../archive/0.1.1/runtime.mjs';
import { runOperationsToTermination, createOperationsController } from '../src/operations.js';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const read = (p: string) => JSON.parse(fs.readFileSync(new URL('../../../fixtures/operations/' + p, import.meta.url), 'utf8'));
describe('explicit immutable archive registration', () => {
 it('registers distinct frozen identities and pinned bytes', () => {
  expect(ARCHIVED_RUNTIMES['0.1.0']).toBe(archive010);
  expect(ARCHIVED_RUNTIMES['0.1.1']).toBe(archive011);
  expect(Object.isFrozen(ARCHIVED_RUNTIMES)).toBe(true);
  expect(createHash('sha256').update(fs.readFileSync(new URL('../archive/0.1.1/runtime.mjs', import.meta.url))).digest('hex')).toBe('9224ce9eb18b88d267bb1eab79767e0f31db2dad6f180d42152cb1df58fd4605');
  expect(CURRENT_IMPLEMENTATION_VERSION).toBe('0.1.1');
 });
 it('rejects unknown and absent versions on all routes', () => {
  for (const v of [undefined, '', '0.1.2', 'constructor']) {
   expect(() => createOperationsControllerForVersion({} as any, v as any)).toThrow();
   expect(recomputeOperationsReportForVersion({ versions: { simulation: v } } as any).verifierImplementationVersion).toBe(null);
   expect(verifyOperationsExperimentForVersion({ versions: { simulation: v } }).verifierImplementationVersion).toBe(null);
  }
 });
 it('preserves exact six-order report and inventory parity and historical verification', () => {
  const scenario = read('picking-packing-burst.json');
  const executionConfig = read('picking-packing-burst.runconfig.json').executionConfig;
  const run = (factory: typeof createOperationsController) => {
   const c = factory({scenario, executionConfig}); runOperationsToTermination(c);
   return {report:c.exportReport(), inventory:c.snapshot().inventory};
  };
  const current = run(createOperationsController);
  expect(run(ARCHIVED_RUNTIMES['0.1.1'].createOperationsController)).toEqual(current);
  expect(run(opts => createOperationsControllerForVersion(opts, '0.1.1'))).toEqual(current);
  expect(recomputeOperationsReportForVersion(current.report).ok).toBe(true);
  const old = run(archive010.createOperationsController);
  expect(recomputeOperationsReportForVersion(old.report)).toMatchObject({ok:true, verifierImplementationVersion:'0.1.0'});
 }, 120000);
});
