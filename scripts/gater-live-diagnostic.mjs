import {writeFileSync,mkdirSync} from 'node:fs';
import {loadConfig,loadEnvFileInto,sanitizeMessage} from '../.coordination/gater-live-dist/config.js';
import {chatCompletionJson,redactStructured} from '../.coordination/gater-live-dist/provider.js';
const env={};loadEnvFileInto(env,'.env.gater.local');const config=loadConfig(env);
if(config.baseUrl!=='https://api.gater.ai.id/v1'||config.modelId!=='glm-5-3-flash')throw Error('Wrong target');
const schema={type:'object',properties:{ready:{type:'boolean',const:true},domain:{type:'string',const:'warehouse'}},required:['ready','domain'],additionalProperties:false};
const artifact={timestamp:new Date().toISOString(),requestCount:1,schema,automaticRetries:0};
try{const r=await chatCompletionJson(config,{schemaName:'warehouse_ready',schema,developerInstruction:'Return the requested readiness object.',userContent:'Return ready true and domain warehouse.'},AbortSignal.timeout(120000));Object.assign(artifact,r,{schemaConformant:r.parsed?.ready===true&&r.parsed?.domain==='warehouse'&&Object.keys(r.parsed).sort().join(',')==='domain,ready'});}catch(e){artifact.error=sanitizeMessage(String(e),config);artifact.diagnostics=e.diagnostics??null;}
mkdirSync('evidence/sanitized/gater-live',{recursive:true});writeFileSync('evidence/sanitized/gater-live/prompt-schema-diagnostic.json',JSON.stringify(redactStructured(artifact,config),null,2));console.log(JSON.stringify({requestCount:1,schemaConformant:artifact.schemaConformant??false,error:artifact.error??null}));
