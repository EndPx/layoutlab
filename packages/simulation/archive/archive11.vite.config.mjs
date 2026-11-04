import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export default {root:path.resolve(here,'..'),logLevel:'warn',resolve:{alias:{'@layoutlab/core':path.resolve(here,'../../core/src/index.ts')}},build:{outDir:path.join(here,'0.1.1'),emptyOutDir:false,sourcemap:false,minify:false,target:'es2022',lib:{entry:path.join(here,'0.1.1/entry.ts'),formats:['es'],fileName:()=> 'runtime.mjs'},rollupOptions:{external:[],output:{inlineDynamicImports:true}}}};
