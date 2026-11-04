// Exercise fail-closed build guards without changing pinned source or artifact bytes.
import fs from 'node:fs';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import assert from 'node:assert/strict';
const mode=process.argv[2],exists=fs.existsSync,read=fs.readFileSync,exec=child.execFileSync;
fs.existsSync=function(p){if(String(p).replaceAll('\\','/').endsWith('0.1.1/runtime.mjs')||String(p).replaceAll('\\','/').endsWith('0.1.1/manifest.json'))return false;return exists(p);};
child.execFileSync=function(command,args,opts){if(mode==='source'&&command==='git'&&args[0]==='hash-object')return 'drift\n';return exec(command,args,opts);};
fs.readFileSync=function(p,...args){if(mode==='version'&&String(p).replaceAll('\\','/').endsWith('packages/simulation/src/version.ts'))return Buffer.from('export const SIMULATION_VERSION = "9.9.9";');return read(p,...args);};syncBuiltinESMExports();
try{await import('../build-archive11.mjs');throw Error('build guard unexpectedly passed');}catch(e){assert.match(String(e),mode==='source'?/pinned source drift/:/version drift/);console.log(mode+' drift refused');}
