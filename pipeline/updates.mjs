import {stable} from './model.mjs';

export function coverageKeys(scope,catalog,targets) {
  if(scope==='batch') {
    const allowed=['micron','industry','quote','news','calendar',...catalog.required_companies.map(c=>'company:'+c)];
    if(!targets?.length||targets.some(k=>!allowed.includes(k)))throw new Error('Batch needs explicit valid targets');
    return [...new Set(targets)];
  }
  if(scope==='discovery') {
    const all=Object.keys(catalog.monitoring?.targets||{});
    if(targets?.some(k=>!all.includes(k)))throw new Error('Unknown discovery target');
    return targets?.length?[...new Set(targets)]:all;
  }
  if(scope.startsWith('company:')) {
    if(!catalog.required_companies.includes(scope.slice(8)))throw new Error('Unknown company');
    return [scope];
  }
  if(scope==='full')return ['micron','industry','quote',...catalog.required_companies.map(c=>'company:'+c)];
  if(scope==='ecosystem')return catalog.required_companies.map(c=>'company:'+c);
  return [scope];
}

export function updatePlan(document,catalog,{mode='weekly',company,now=new Date().toISOString()}={}) {
  if(!['weekly','midweek','earnings','manual'].includes(mode))throw new Error('Unknown update mode');
  if(company&&!['micron',...catalog.required_companies].includes(company))throw new Error('Unknown company');
  const clock=Date.parse(now),checks=document.monitoring?.checks||[];
  const events=document.monitoring?.calendar||[];
  const published=id=>id==='micron'?document.financial_published_at:document.ecosystem.companies.find(c=>c.id===id)?.published_at;
  const outstanding=e=>String(published(e.company_id)).slice(0,10)<e.scheduled_at.slice(0,10);
  const pending=events.filter(e=>e.confirmation==='confirmed'&&Date.parse(e.review_after)<=clock&&outstanding(e));
  const keys=Object.keys(catalog.monitoring.targets).filter(k=>company?k==='company:'+company:mode==='midweek'?['industry','news'].includes(k):mode==='earnings'?pending.some(e=>k==='company:'+e.company_id)||checks.some(c=>c.key===k&&k.startsWith('company:')&&c.finding==='new_disclosure'&&!c.processed_at):true);
  const newer=checks.filter(c=>c.finding==='new_disclosure'&&!c.processed_at&&keys.includes(c.key));
  const financial=[...new Set([...pending.filter(e=>keys.includes('company:'+e.company_id)).map(e=>e.company_id),...newer.filter(c=>c.key.startsWith('company:')).map(c=>c.key.slice(8))])];
  const future=events.filter(e=>e.confirmation==='confirmed'&&Date.parse(e.review_after)>clock&&outstanding(e)).sort((a,b)=>Date.parse(a.review_after)-Date.parse(b.review_after));
  return {mode,as_of:now,discovery_targets:keys,financial_candidates:financial.map(id=>({company:id,scope:id==='micron'?'micron':'company:'+id,action:'Read newly published or revised documents; preserve old facts until the report bundle passes.'})),news:mode!=='earnings'&&!company,next_event_run_at:future[0]?.review_after||null,next_event_companies:future.filter(e=>e.review_after===future[0]?.review_after).map(e=>e.company_id)};
}

export function validateUpdates(d,catalog,ledger) {
  const errors=[],add=(code,path,message)=>errors.push({code,path,message});
  const m=d.monitoring;
  if(m){
    if(stable(m.policy)!==stable(catalog.monitoring.policy))add('UPDATE_POLICY','monitoring.policy','Published policy must match the catalog');
    const keys=new Set();
    for(const c of m.checks){
      if(keys.has(c.key)||!catalog.monitoring.targets[c.key])add('DISCOVERY_TARGET',c.key,'Duplicate or unknown discovery target');keys.add(c.key);
      if(c.checked_at&&Date.parse(c.checked_at)>Date.parse(c.attempted_at))add('DISCOVERY_TIME',c.key,'A successful check cannot be later than its attempt');
      if(c.finding==='new_disclosure'&&!c.latest_disclosure?.url)add('DISCOVERY_FINDING',c.key,'New disclosure needs an original link');
      if(c.source_ids.some(sid=>!d.sources[sid]))add('DISCOVERY_SOURCE',c.key,'Unknown discovery source');
    }
    for(const e of m.calendar){
      if(!['micron',...catalog.required_companies].includes(e.company_id))add('CALENDAR_COMPANY',e.id,'Unknown company');
      if(Date.parse(e.review_after)<Date.parse(e.scheduled_at))add('CALENDAR_TIME',e.id,'Review must follow publication');
      if(e.confirmation==='confirmed'&&!e.source_ids.length)add('CALENDAR_SOURCE',e.id,'Confirmed dates need original evidence');
    }
  }
  const keys=new Set(),ids=new Set();
  for(const n of d.news?.items||[]){
    if(keys.has(n.story_key)||ids.has(n.id))add('NEWS_DUPLICATE',n.id,'One card per story; update the existing story');keys.add(n.story_key);ids.add(n.id);
    if(!catalog.monitoring.news_categories[n.category])add('NEWS_CATEGORY',n.id,'Register this news category');
    if(n.companies.some(id=>!catalog.monitoring.news_entities[id]))add('NEWS_COMPANY',n.id,'Register this news entity');
    if(Date.parse(n.published_at)>Date.parse(d.updated_at)||Date.parse(n.updated_at)<Date.parse(n.published_at))add('NEWS_DATE',n.id,'Invalid publication/update dates');
    if(!Number.isFinite(Date.parse(n.published_at))||!Number.isFinite(Date.parse(n.updated_at))||Date.parse(n.updated_at)>Date.parse(d.updated_at))add('NEWS_DATE',n.id,'News dates must be valid and not later than the release');
    if(n.source_ids.some(sid=>!d.sources[sid]))add('NEWS_SOURCE',n.id,'Unknown original source');
    for(const ref of n.fact_refs){
      const r=d.news.fact_records?.[ref.record_id];
      if(!r||r.metric_id!==ref.metric_id||ledger&&stable(r)!==stable(publicFact(ledger.records[ref.record_id])))add('NEWS_FACT_REFERENCE',n.id,'News must bind to an immutable, evidenced fact');
    }
  }
  if(d.news&&(stable(d.news.categories)!==stable(catalog.monitoring.news_categories)||stable(d.news.entities)!==stable(catalog.monitoring.news_entities)))add('NEWS_REGISTRY','news','Published labels must match registered categories and entities');
  return errors;
}

export function publicFact(record){return record?{metric_id:record.metric_id,context:record.context,payload:record.payload}:null;}

export function deriveDiscovery(previous,next,run,catalog){
  if(next.news){next.news.categories=structuredClone(catalog.monitoring.news_categories);next.news.entities=structuredClone(catalog.monitoring.news_entities);}
  if(!next.monitoring)return;
  next.monitoring.policy=structuredClone(catalog.monitoring.policy);
  next.monitoring.checks=structuredClone(previous.monitoring?.checks||[]);
  if(run.scope!=='discovery'){
    for(const check of next.monitoring.checks){
      const key=check.key==='company:micron'?'micron':check.key;
      const coverage=run.coverage.find(c=>c.key===key&&['verified','unchanged','gap'].includes(c.status));
      if(check.finding==='new_disclosure'&&coverage&&stable(coverage.latest_disclosure)===stable(check.latest_disclosure))check.processed_at=run.completed_at;
    }
    return;
  }
  for(const c of run.coverage){
    const old=next.monitoring.checks.find(x=>x.key===c.key);
    const successful=['verified','unchanged','gap'].includes(c.status);
    const sameDisclosure=stable(c.latest_disclosure)===stable(old?.latest_disclosure);
    const unresolved=old?.finding==='new_disclosure'&&!old.processed_at&&sameDisclosure;
    const entry={key:c.key,status:c.status,finding:successful?(unresolved?'new_disclosure':c.finding||'unchanged'):(old?.finding||'unconfirmed'),checked_at:successful?c.reviewed_at:old?.checked_at||null,attempted_at:run.completed_at,latest_disclosure:successful?c.latest_disclosure:old?.latest_disclosure||null,source_ids:successful?c.evidence:old?.source_ids||[],reason:c.reason||'',processed_at:!successful||sameDisclosure?old?.processed_at||null:null};
    next.monitoring.checks=next.monitoring.checks.filter(x=>x.key!==c.key);next.monitoring.checks.push(entry);
  }
}

export function validateUpdateTransition(previous,next,run,catalog){
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  if(previous.monitoring&&!next.monitoring)add('UPDATE_HISTORY','monitoring','Retain monitoring state');
  for(const old of previous.monitoring?.checks||[])if(!next.monitoring?.checks.some(c=>c.key===old.key))add('UPDATE_HISTORY',old.key,'Retain discovery coverage history');
  for(const c of next.monitoring?.checks||[]){
    const old=previous.monitoring?.checks?.find(x=>x.key===c.key);
    if(stable(old)===stable(c))continue;
    const financialKey=c.key==='company:micron'?'micron':c.key;
    if(old&&c.processed_at!==old.processed_at&&stable({...old,processed_at:null})===stable({...c,processed_at:null})&&run.coverage?.some(x=>x.key===financialKey&&['verified','unchanged','gap'].includes(x.status)&&stable(x.latest_disclosure)===stable(c.latest_disclosure))&&c.processed_at===run.completed_at)continue;
    const coverage=run.coverage?.find(x=>x.key===c.key);
    if(run.scope!=='discovery'||!coverage)add('DISCOVERY_SCOPE',c.key,'Discovery dates require a discovery run');
    else if(c.checked_at!==old?.checked_at&&c.checked_at!==null){
      if(c.checked_at!==coverage.reviewed_at||!c.source_ids.length||!c.source_ids.every(id=>run.reads?.some(r=>r.source_id===id&&r.status==='read'&&r.reviewed_at)))add('DISCOVERY_READ',c.key,'Discovery checks require actual index/disclosure reads');
    }
  }
  for(const old of previous.news?.items||[]){
    const current=next.news?.items?.find(x=>x.id===old.id);
    if(!current)add('NEWS_HISTORY',old.id,'Retain stories; archive via date filters');
    else if(old.published_at!==current.published_at||old.story_key!==current.story_key)add('NEWS_IDENTITY',old.id,'Retain the original story identity and publication date');
  }
  // A changed scope cannot make unrelated financial metadata look freshly read.
  if(['discovery','news','calendar','maintenance'].includes(run.scope)){
    for(const key of ['metrics','guidance','ecosystem','quote','financial_period','financial_as_of','financial_published_at','overview'])if(stable(previous[key])!==stable(next[key]))add('UNRELATED_FACT_CHANGE',key,'This run cannot change financial/quote facts or their dates');
  }
  return issues;
}
