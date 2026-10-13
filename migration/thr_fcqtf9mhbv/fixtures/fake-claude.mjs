import {createInterface} from 'node:readline';
import {readFileSync,appendFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const log=(x)=>appendFileSync(join(root,'fake-cli.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,...x})+'\n');
log({kind:'launch',args,cwd:process.cwd(),configDir:process.env.CLAUDE_CONFIG_DIR??null});
if(args.includes('--version')) { console.log('2.1.238 (isolated synthetic Claude fixture)'); process.exit(0); }
if(args[0]==='auth') {
 console.log('Synthetic sign-in fixture. No OAuth or real credentials are used.');
 log({kind:'simulated-auth-command',configDir:process.env.CLAUDE_CONFIG_DIR??null});
 const loginMode=existsSync(join(root,'login-mode'))?readFileSync(join(root,'login-mode'),'utf8').trim():'success';
 if(loginMode==='failure') {console.log('Synthetic sign-in failed.');process.exit(1);}
 if(loginMode==='wait') {
  console.log('Press Enter to complete synthetic sign-in, or cancel in BB.');
  for await(const line of createInterface({input:process.stdin})) {break;}
 }
 const profile=process.env.CLAUDE_CONFIG_DIR;
 if(!profile||!profile.startsWith(root+'/')) {console.error('Fixture refuses a profile outside its isolated artifact directory.');process.exit(2);}
 mkdirSync(profile,{recursive:true});
 writeFileSync(join(profile,'.credentials.json'),JSON.stringify({claudeAiOauth:{accessToken:'SYNTHETIC_NON_SECRET_TOKEN',refreshToken:'SYNTHETIC_NON_SECRET_REFRESH',expiresAt:Date.now()+86400000,scopes:['user:inference'],subscriptionType:'pro'}}));
 writeFileSync(join(root,'mode'),'recovered');
 console.log('Synthetic sign-in completed for the isolated profile.');
 process.exit(0);
}
if(args[0]==='doctor') {console.log('Running: native\nAuto-update channel: stable');process.exit(0);}
const at=args.findIndex(a=>a==='--resume'||a==='--session-id');
const equalsArg=args.find(a=>a.startsWith('--resume=')||a.startsWith('--session-id='));
const sid=equalsArg?equalsArg.slice(equalsArg.indexOf('=')+1):at>=0?args[at+1]:randomUUID();
log({kind:'session-selection',sessionId:sid,resumeRequested:args.some(a=>a==='--resume'||a.startsWith('--resume='))});
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
const models=[{value:'sonnet',displayName:'Synthetic Sonnet',description:'Isolated fixture',supportsEffort:true,supportedEffortLevels:['low','medium','high']}];
for await(const line of createInterface({input:process.stdin})) {
 let msg;try {msg=JSON.parse(line);}catch {continue;}
 if(msg.type==='control_request') {
  const subtype=msg.request.subtype;log({kind:'control',subtype});
  const response=subtype==='initialize'?{commands:[],models,account:{tokenSource:'none',apiProvider:'firstParty'},pid:process.pid}:subtype==='get_context_usage'?{usage:[],totalTokens:0,contextWindow:200000}:{};
  send({type:'control_response',response:{subtype:'success',request_id:msg.request_id,response}});
 } else if(msg.type==='user') {
  const mode=readFileSync(join(root,'mode'),'utf8').trim();
  log({kind:'turn',mode,sessionId:sid});
  const failed=mode==='expired';
  send({type:'system',subtype:'init',cwd:process.cwd(),session_id:sid,tools:[],mcp_servers:[],model:'claude-sonnet-4-5',permissionMode:'default',slash_commands:[],apiKeySource:'none',claude_code_version:'2.1.238',uuid:randomUUID()});
  await new Promise(r=>setTimeout(r,1200));
  const text=failed?'SYNTHETIC AUTH TEST: OAuth token expired · Please run /login':`SIMULATED RESPONSE (${mode}): prior thread context retained by BB.`;
  const usage={input_tokens:0,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0};
  send({type:'assistant',session_id:sid,uuid:randomUUID(),parent_tool_use_id:null,...(failed?{error:'authentication_failed',is_api_error_message:true}:{}),message:{id:randomUUID(),type:'message',role:'assistant',model:'<synthetic>',content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null,usage}});
  send({type:'result',subtype:'success',is_error:failed,result:text,session_id:sid,uuid:randomUUID(),duration_ms:1200,duration_api_ms:0,num_turns:1,total_cost_usd:0,usage,modelUsage:{},permission_denials:[]});
 }
}
