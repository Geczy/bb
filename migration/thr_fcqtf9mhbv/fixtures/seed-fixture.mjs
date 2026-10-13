import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const task = process.env.TASK_DIR;
const base = 'http://127.0.0.1:26445/api/v1';
async function request(path, method='GET', body) {
 const response = await fetch(base + path, {method, headers: {'content-type':'application/json'}, ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw = await response.text();
 if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${raw}`);
 return raw ? JSON.parse(raw) : null;
}
const config = await request('/system/config');
await request('/settings/general','PUT',{...config.generalSettings, onboardingCompletedAt:new Date().toISOString(), telemetryEnabled:false});
const hostId=(await request('/hosts'))[0].id;
const project=await request('/projects','POST',{name:'Failed sign-in recovery fixture',source:{type:'local_path',hostId,type:'local_path',path:join(task,'workspace')}});
await request(`/projects/${project.id}/machine-environment`,'POST',{name:'CLAUDE_CONFIG_DIR',value:join(task,'custom-profile'),note:'Task-local synthetic QA profile'});
const thread=await request('/threads','POST',{projectId:project.id,providerId:'claude-code',origin:'sdk',title:'Existing thread · synthetic auth recovery',input:[{type:'text',text:'PRIOR_OUTPUT_REQUEST: say the thread history and workspace are intact.'}],model:'sonnet',environment:{type:'host',hostId,workspace:{type:'unmanaged',path:join(task,'workspace')}}});
writeFileSync(join(task,'fixture.json'),JSON.stringify({hostId,projectId:project.id,threadId:thread.id,thread,baseUrl:base},null,2));
console.log(JSON.stringify({hostId,projectId:project.id,threadId:thread.id,threadStatus:thread.status}));
