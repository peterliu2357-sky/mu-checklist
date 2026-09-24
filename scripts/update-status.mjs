import fs from 'node:fs';
import path from 'node:path';
import {hash,stable} from '../pipeline/model.mjs';

const accepted=status=>['verified','unchanged','gap'].includes(status);
const instant=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const latest=(a,b)=>!b?a:!a||Date.parse(b)>Date.parse(a)?b:a;
const keyFor=key=>key==='micron'?'company:micron':key;
function stripClocks(value){
  if(Array.isArray(value))return value.map(stripClocks);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['checked_at','updated_at','next_review'].includes(key)).map(([key,item])=>[key,stripClocks(item)]));
  return value;
}
function content(document,key){
  if(key==='quote')return stripClocks(document.quote);
  if(key==='news')return stripClocks(document.news?.items||[]);
  if(key.startsWith('technology:'))return (document.technology?.items||[]).filter(i=>i.type===({facilities:'facility',processes:'process',products:'product'})[key.slice(11)]);
  if(key==='calendar')return document.monitoring?.calendar||[];
  if(key==='industry')return stripClocks(document.metrics.filter(m=>m.category==='industry'));
  if(key==='company:micron')return stripClocks({period:document.financial_period,published:document.financial_published_at,metrics:document.metrics.filter(m=>m.category==='business'),guidance:document.guidance});
  if(key.startsWith('company:'))return stripClocks(document.ecosystem.companies.find(c=>c.id===key.slice(8))||null);
  return null;
}
export function validateSchedule(schedule){
  if(schedule?.version!==1||schedule.display_timezone!=='America/Los_Angeles'||!instant(schedule.verified_at))throw new Error('Invalid public update schedule');
  for(const key of ['quote','research']){
    const p=schedule[key];
    if(typeof p?.enabled!=='boolean'||!instant(p.starts_at)||!Array.isArray(p.weekdays)||!p.weekdays.length||p.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isInteger(p.hour)||p.hour<0||p.hour>23||!Number.isInteger(p.minute)||p.minute<0||p.minute>59)throw new Error('Invalid schedule: '+key);
    new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format();
  }
  const e=schedule.earnings;
  if(typeof e?.enabled!=='boolean'||!Array.isArray(e.events)||e.enabled&&(!instant(e.run_at)||!e.events.length||e.events.some(x=>!x.id||!x.company_id||!instant(x.review_after)||Date.parse(e.run_at)<Date.parse(x.review_after))))throw new Error('Invalid earnings schedule');
  if(!Number.isFinite(schedule.completion_grace_minutes)||schedule.completion_grace_minutes<0)throw new Error('Invalid completion grace');
}
export function buildUpdateStatus(document,snapshots,receipts,schedule){
  validateSchedule(schedule);
  const documents=new Map([...snapshots,document].map(d=>[d.revision,d]));
  const byArtifact=new Map(receipts.map(r=>[r.artifact_sha256,r]));
  const chain=[],seen=new Set();let next=document;
  while(byArtifact.has(hash(next))){
    const r=byArtifact.get(hash(next)),before=documents.get(r.base_revision);
    if(seen.has(r.artifact_sha256))throw new Error('Cyclic publication history');
    seen.add(r.artifact_sha256);
    if(!before||hash(before)!==r.base_sha256)throw new Error('Update-time history does not match its verified base');
    if(r.completed_at&&(!instant(r.completed_at)||Date.parse(r.completed_at)>Date.parse(document.updated_at)))throw new Error('Invalid release completion time');
    chain.unshift({receipt:r,before,after:next});next=before;
  }
  const checks={};
  const ensure=key=>checks[key]||=({last_checked_at:null,last_content_update_at:null,last_attempt_at:null,status:null});
  const checked=(key,at)=>{if(at)ensure(key).last_checked_at=latest(ensure(key).last_checked_at,at);};
  const attempt=(key,at,status)=>{const c=ensure(key);if(instant(at)&&(!c.last_attempt_at||Date.parse(at)>=Date.parse(c.last_attempt_at))){c.last_attempt_at=at;c.status=status;}};
  const companies=['micron',...document.ecosystem.companies.map(c=>c.id)];
  for(const c of document.ecosystem.companies)checked('company:'+c.id,c.checked_at);
  checked('company:micron',document.last_successful_check_at);
  checked('quote',document.quote.checked_at);
  for(const log of document.check_log||[]){
    // Older audit entries had no scope. They are history, not a check of every source.
    const scope=typeof log.scope==='string'?log.scope:'';
    const keys=scope==='full'?['quote','industry',...companies.map(c=>'company:'+c)]:scope==='ecosystem'?companies.filter(c=>c!=='micron').map(c=>'company:'+c):['quote','industry','micron'].includes(scope)||scope.startsWith('company:')?[keyFor(scope)]:[];
    for(const key of keys){attempt(key,log.at,log.status);if(log.status==='success')checked(key,log.at);}
  }
  let lastDataUpdateAt=null,lastDataKeys=[];
  for(const {receipt:r,before,after} of chain){
    if(!instant(r.completed_at)||r.migration||r.state!=='verified')continue;
    const changed=[];
    for(const c of r.coverage||[]){
      const key=keyFor(c.key);
      attempt(key,r.completed_at,c.status);
      // A news import reviews selected stories; only discovery/news checks all entry sources.
      if(accepted(c.status)&&(!['news','technology:facilities','technology:processes','technology:products'].includes(key)||r.scope==='discovery')&&!(r.scope==='discovery'&&key.startsWith('company:')))checked(key,c.reviewed_at||r.completed_at);
      if(!accepted(c.status)||['discovery','source_audit','maintenance'].includes(r.scope)||!['success','partial'].includes(r.result))continue;
      if(stable(content(before,key))!==stable(content(after,key))){ensure(key).last_content_update_at=r.completed_at;changed.push(key);}
    }
    if(changed.length){lastDataUpdateAt=r.completed_at;lastDataKeys=changed;}
  }
  for(const c of document.monitoring?.checks||[]){
    const key=keyFor(c.key);attempt(key,c.attempted_at,c.status);
    if(!key.startsWith('company:'))checked(key,c.checked_at);
  }
  ensure('news');ensure('industry');
  if(document.technology)for(const topic of ['facilities','processes','products'])ensure('technology:'+topic);
  return {version:1,data_revision:document.revision,data_sha256:hash(document),last_data_update_at:lastDataUpdateAt,last_data_keys:lastDataKeys,checks,schedule};
}
export function readUpdateStatus(document,root='.'){
  const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  const files=dir=>fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.json')).map(n=>read(dir+'/'+n));
  return buildUpdateStatus(document,files('data/history'),files('data/releases'),read('config/update-schedule.json'));
}
