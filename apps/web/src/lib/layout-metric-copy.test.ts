import {describe,it,expect} from 'vitest';
import {formatLayoutMetric as fmt,exactLayoutMetric} from './layout-metric-copy';
describe('layout metric presentation',()=>{
 it('preserves unavailable values rather than inventing zero',()=>{for(const v of [null,undefined,NaN,Infinity,'0'])expect(fmt('makespanMs',v)).toBe('unavailable');});
 it('uses the same duration units and signs for original, proposed and delta',()=>{
 expect(fmt('makespanMs',61500)).toBe('1 min 1.5 s');expect(fmt('totalWaitMs',-1500,true)).toBe('-1.5 s');expect(fmt('makespanMs',1,true)).toBe('+0.001 s');expect(fmt('totalWaitMs',0,true)).toBe('0 s');expect(fmt('makespanMs',3600000)).toBe('60 min 0 s');
 });
 it('retains count units and exact milliseconds for disclosure',()=>{expect(fmt('shipped',6)).toBe('6');expect(fmt('backlog',2,true)).toBe('+2');expect(exactLayoutMetric('totalWaitMs',61500)).toBe('61500 ms');expect(exactLayoutMetric('shipped',6)).toBe('6 orders');expect(exactLayoutMetric('makespanMs',null)).toBe('unavailable');});
});
