import {stable} from './model.mjs';
import {technologyTargets} from './technology.mjs';
import freshness from '../lib/freshness-core.js';

export function coverageKeys(scope,catalog,targets) {
  if(scope==='batch') {
    const allowed=['micron','industry','quote','news','calendar',...technologyTargets(catalog),...catalog.required_companies.map(c=>'company:'+c)];
    if(!targets?.length||targets.some(k=>!allowed.includes(k)))throw new Error('Batch needs explicit valid targets');
    return [...new Set(targets)];
  }
  if(scope==='technology')return technologyTargets(catalog);
  if(scope.startsWith('technology:')){if(!technologyTargets(catalog).includes(scope))throw new Error('Unknown technology topic');return [scope];}
  if(scope==='discovery') {
    const all=Object.keys(catalog.monitoring?.targets||{});
    if(targets?.some(k=>!all.includes(k)))throw new Error('Unknown discovery target');
    return targets?.length?[...new Set(targets)]:all.filter(k=>catalog.monitoring.targets[k].cadence!=='retired');
  }
  if(scope.startsWith('company:')) {
    if(!catalog.required_companies.includes(scope.slice(8)))throw new Error('Unknown company');
    return [scope];
  }
  if(scope==='full')return ['micron','industry','quote',...technologyTargets(catalog),...catalog.required_companies.map(c=>'company:'+c)];
  if(scope==='ecosystem')return catalog.required_companies.map(c=>'company:'+c);
  return [scope];
}

export function updatePlan(document,catalog,{mode='weekly',company,now=new Date().toISOString()}={}) {
  if(!['weekly','midweek','earnings','manual'].includes(mode))throw new Error('Unknown update mode');
  if(company&&!['micron',...catalog.required_companies].includes(company))throw new Error('Unknown company');
  const clock=Date.parse(now),checks=document.monitoring?.checks||[];
  const events=document.monitoring?.calendar||[];
  const published=id=>id==='micron'?document.financial_published_at:document.ecosystem.companies.find(c=>c.id===id)?.published_at;
  const outstanding=e=>!published(e.company_id)||String(published(e.company_id)).slice(0,10)<e.scheduled_at.slice(0,10);
  const pending=events.filter(e=>e.confirmation==='confirmed'&&Date.parse(e.review_after)<=clock&&outstanding(e));
  const due=new Set([
    ...pending.map(e=>'company:'+e.company_id),
    ...checks.filter(c=>c.key.startsWith('company:')&&c.finding==='new_disclosure'&&!c.processed_at).map(c=>c.key)
  ]);
  // Retired targets keep their past checks and records but are no longer scheduled.
  const targets=Object.keys(catalog.monitoring.targets).filter(k=>catalog.monitoring.targets[k].cadence!=='retired');
  const keys=targets.filter(k=>company?k==='company:'+company:mode==='manual'||due.has(k)||mode!=='earnings'&&catalog.monitoring.targets[k].cadence==='twice_weekly');
  const newer=checks.filter(c=>c.finding==='new_disclosure'&&!c.processed_at&&keys.includes(c.key));
  const financial=[...new Set([...pending.filter(e=>keys.includes('company:'+e.company_id)).map(e=>e.company_id),...newer.filter(c=>c.key.startsWith('company:')).map(c=>c.key.slice(8))])];
  const future=events.filter(e=>e.confirmation==='confirmed'&&Date.parse(e.review_after)>clock&&outstanding(e)).sort((a,b)=>Date.parse(a.review_after)-Date.parse(b.review_after));
  // Missing dates need calendar maintenance, not another read of unchanged reports.
  const calendarTargets=mode==='weekly'&&!company?targets.filter(k=>k.startsWith('company:')).map(k=>k.slice(8)).filter(id=>!events.some(e=>e.company_id===id&&e.confirmation==='confirmed'&&outstanding(e))):[];
  const related=id=>[...new Set(Object.values(catalog.technology?.items||{}).filter(i=>i.company_id===id).map(i=>'technology:'+({facility:'facilities',process:'processes',product:'products'})[i.type]))];
  // Rows past their freshness limit: a routine run cannot publish until each is updated or checked (docs/CADENCE.md, "Row freshness").
  const rowReviews=keys.includes('industry')?freshness.report(document,catalog.freshness,clock).filter(r=>r.state==='overdue'||r.state==='pending').map(({metric_id,label,state,date,age_days,limit_days})=>({metric_id,label,state,data_date:date,age_days,limit_days})):[];
  return {mode,as_of:now,discovery_targets:keys,row_reviews:rowReviews,calendar_targets:calendarTargets,financial_candidates:financial.map(id=>({company:id,scope:id==='micron'?'micron':'company:'+id,related_technology_targets:related(id),action:'Read newly published or revised documents; review tracked technology items; preserve old facts until the report bundle passes.'})),technology_candidates:newer.filter(c=>c.key.startsWith('technology:')).map(c=>({scope:c.key,latest_disclosure:c.latest_disclosure})),next_event_run_at:future[0]?.review_after||null,next_event_companies:future.filter(e=>e.review_after===future[0]?.review_after).map(e=>e.company_id)};
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

const list=v=>Array.isArray(v)?v:[];
// Row checks come from run receipts: earlier ones stay while the row still shows the reading they checked, and this run's are stamped with its completion time.
export function deriveRowReviews(previous,next,run,catalog){
  if(!next.monitoring)return;
  const rows=new Map(freshness.tracked(next,catalog.freshness).map(t=>[t.metric_id,freshness.dataDate(t.row,next.sources)]));
  const reviews=new Map((previous.monitoring?.row_reviews||[]).filter(r=>rows.get(r.metric_id)===r.data_date).map(r=>[r.metric_id,r]));
  for(const r of list(run.row_reviews))if(rows.get(r?.metric_id))reviews.set(r.metric_id,{metric_id:r.metric_id,finding:r.finding,reviewed_at:run.completed_at,data_date:rows.get(r.metric_id),source_ids:list(r.source_ids),note:String(r.note||'')});
  if(reviews.size)next.monitoring.row_reviews=[...reviews.values()].sort((a,b)=>a.metric_id<b.metric_id?-1:1);else delete next.monitoring.row_reviews;
}

const acceptedKeys=run=>new Set((run.coverage||[]).filter(c=>['verified','unchanged','gap'].includes(c.status)).map(c=>c.key));
// A run that checked industry sources must leave no dated row silently old.
export function validateRowFreshness(previous,next,run,catalog){
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  const industry=acceptedKeys(run).has('industry'),tracked=new Set(freshness.tracked(next,catalog.freshness).map(t=>t.metric_id));
  if(run.row_reviews!==undefined&&!Array.isArray(run.row_reviews))add('ROW_REVIEW','row_reviews','row_reviews is a list of {metric_id, finding, source_ids, note}');
  const earlier=new Map((previous.monitoring?.row_reviews||[]).map(r=>[r.metric_id,r]));
  for(const r of list(run.row_reviews)){
    const id=r?.metric_id||'row_reviews';
    if(!industry)add('ROW_REVIEW',id,'Row checks need completed industry coverage in the same run');
    if(!tracked.has(r?.metric_id)||!['no_newer','newer_found'].includes(r.finding))add('ROW_REVIEW',id,'Check a published row that has a freshness limit, with finding no_newer or newer_found');
    else if(typeof r.note!=='string'||!r.note.trim())add('ROW_REVIEW',id,'Say in note what was read and what it showed');
    if(!list(r?.source_ids).length||list(r.source_ids).some(sid=>!next.sources[sid]||!run.reads?.some(x=>x.source_id===sid&&x.status==='read'&&x.reviewed_at&&x.sha256)))add('ROW_REVIEW',id,'A row check cites published sources actually read in this run');
    // Newer data can be reported once; after that it has to be entered.
    const before=earlier.get(r?.metric_id),now=(next.monitoring?.row_reviews||[]).find(x=>x.metric_id===r?.metric_id);
    if(r?.finding==='newer_found'&&before?.finding==='newer_found'&&before.data_date===now?.data_date)add('ROW_FRESHNESS',id,'Newer data was already found in an earlier run; enter it in an industry run instead of reporting it again');
  }
  const expected=structuredClone(next);deriveRowReviews(previous,expected,run,catalog);
  if(stable(expected.monitoring?.row_reviews||[])!==stable(next.monitoring?.row_reviews||[]))add('ROW_REVIEW','monitoring.row_reviews','Row checks are derived from run receipts and cannot be edited by hand');
  if(!industry||!Number.isFinite(Date.parse(run.completed_at)))return issues;
  const editable=run.scope!=='discovery';
  for(const r of freshness.report(next,catalog.freshness,Date.parse(run.completed_at))){
    const where=`${r.metric_id} (${r.label}): reading dated ${r.date}, limit ${r.limit_days} days`;
    if(r.state==='overdue')add('ROW_FRESHNESS',r.metric_id,`${where}. ${editable?'Update the row, retire it, or add a row_reviews entry with finding no_newer':'Add a row_reviews entry: no_newer if the source has nothing newer, newer_found if it does'} after reading its source`);
    else if(r.state==='pending'&&(editable||r.review.reviewed_at!==run.completed_at))add('ROW_FRESHNESS',r.metric_id,`${where}. Newer data was found${editable?'':' in an earlier run'}; enter it in an industry run before publishing`);
  }
  return issues;
}

// Card prose restates its rows, so changed rows need the prose rewritten or explicitly re-read.
export function validateInterpretations(previous,next,run){
  const issues=[];
  for(const m of next.metrics){
    const old=previous.metrics.find(x=>x.id===m.id);
    if(old&&m.interpretation&&stable(old.rows)!==stable(m.rows)&&old.interpretation===m.interpretation&&!run.interpretation_reviewed?.includes(m.id))issues.push({code:'INTERPRETATION_STALE',path:m.id,message:'Rows on this card changed but its interpretation did not. Rewrite it, or list the card in manifest.interpretation_reviewed after re-reading it against the new rows'});
  }
  return issues;
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
    for(const key of ['metrics','guidance','ecosystem','quote','financial_period','financial_as_of','financial_published_at','overview','technology'])if(stable(previous[key])!==stable(next[key]))add('UNRELATED_FACT_CHANGE',key,'This run cannot change financial/quote/technology facts or their dates');
  }
  return issues;
}
