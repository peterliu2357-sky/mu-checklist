import {clone,hash,stable,materialize,recordDocument,makeRecord,activeRecords,calculate,recordHash} from './model.mjs';
import series from '../lib/series-core.js';
const {isObservationDate,compareDates}=series;
import {validateLedger,validateTransition} from './validate.mjs';
import {coverageKeys,deriveDiscovery} from './updates.mjs';
import {technologyTargets,technologyReviews} from './technology.mjs';

export const scopeKeys=(scope,catalog,targets)=>scope==='maintenance'?[]:coverageKeys(scope,catalog,targets);
export function createManifest({scope='full',base_commit,document,catalog,at,targets}) {
  if(!['full','micron','industry','quote','ecosystem','source_audit','discovery','news','calendar','maintenance','batch','technology',...technologyTargets(catalog)].includes(scope)&&!scope.startsWith('company:'))throw new Error('Unknown scope');
  // Retired targets stay readable in old receipts but cannot start new collection.
  const retired=Object.keys(catalog.monitoring?.targets||{}).filter(k=>catalog.monitoring.targets[k].cadence==='retired');
  if(retired.includes(scope)||scopeKeys(scope,catalog,targets).some(k=>retired.includes(k)))throw new Error('Retired target: '+[scope,...(targets||[])].filter(k=>retired.includes(k)).join(','));
  return {version:1,scope,base_commit,base_revision:document.revision,base_sha256:hash(document),catalog_sha256:hash(catalog),created_at:at,completed_at:null,state:'planned',
    targets:targets||null,coverage:scopeKeys(scope,catalog,targets).map(key=>({key,status:'pending',evidence:[],reviewed_at:null,latest_disclosure:null,reason:''})),reads:[],report_bundle:[],publication_corrections:[],technology_reviews:technologyReviews(document,scopeKeys(scope,catalog,targets).filter(k=>k==='micron'||k.startsWith('company:')).map(k=>k==='micron'?'micron':k.slice(8)))};
}

function changedCompany(old,next){return stable({...old,checked_at:null})!==stable({...next,checked_at:null});}
function issue(code,path,message){return {code,path,message};}
export function buildCandidate({previousLedger,previousEvidence,proposal,supporting,history={},evidenceInput,manifest,catalog,legacy}) {
  const previous=materialize(previousLedger),run=clone(manifest),at=run.completed_at;
  if(!at||!Number.isFinite(Date.parse(at)))throw new Error('completed_at must be fixed before building');
  if(hash(previous)!==run.base_sha256)throw new Error('BASE_CHANGED: run was prepared against different data');
  if(hash(catalog)!==run.catalog_sha256)throw new Error('CATALOG_CHANGED: start a new run after catalog changes');
  const issues=[],add=(...x)=>issues.push(issue(...x));
  const accepted=new Set(run.coverage.filter(c=>['verified','unchanged','gap'].includes(c.status)).map(c=>c.key));
  const complete=scopeKeys(run.scope,catalog,run.targets).every(k=>accepted.has(k));
  let next=calculate(proposal,catalog,supporting);
  if(run.scope==='source_audit'){
    const numeric=v=>{const out={};function walk(x,p){if(typeof x==='number')out[p]=x;else if(x&&typeof x==='object')for(const[k,item]of Object.entries(x))walk(item,p+'/'+k);}walk(v,'');return stable(out);};
    if(numeric(proposal)!==numeric(previous))add('AUDIT_SCOPE','proposal','A source-only audit cannot change numeric facts');
  }
  const recordInScope=(scope,id)=>scope==='full'||scope==='source_audit'||(scope==='news'&&id.startsWith('news.'))||(scope==='calendar'&&id.startsWith('calendar.'))||(scope.startsWith('company:')&&["eco."+scope.slice(8)+".","outlook."+scope.slice(8)+"."].some(p=>id.startsWith(p)))||(scope==='ecosystem'&&(id.startsWith('eco.')||id.startsWith('outlook.')))||(scope==='quote'&&id==='quote.mu')||(scope==='industry'&&/^mu\.(contract|supply|demand)\./.test(id))||(scope==='micron'&&(!/^(eco|outlook|quote|news|calendar)\./.test(id)&&!/^mu\.(contract|supply|demand)\./.test(id)));
  const scoped=(scope,id)=>id.startsWith('tech.')?scope==='full'||scope==='source_audit'||scope==='technology'||scope===catalog.definitions[id]?.monitoring_target:recordInScope(scope,id);
  const inScope=id=>run.scope==='batch'?run.targets.some(scope=>scoped(scope,id)):scoped(run.scope,id);
  const financialAccepted=run.scope==='discovery'?new Set():accepted;
  // Dates come from source-read receipts and completed coverage, never from the proposed JSON.
  next.updated_at=at;next.last_successful_check_at=previous.last_successful_check_at;next.last_attempt_at=previous.last_attempt_at;next.last_source_audit_at=previous.last_source_audit_at;
  next.quote.checked_at=previous.quote.checked_at;next.ecosystem.checked_at=previous.ecosystem.checked_at;
  if(run.scope==='full'){next.last_attempt_at=at;if(complete)next.last_successful_check_at=at;}
  if(run.scope==='source_audit'&&complete)next.last_source_audit_at=at;
  if(accepted.has('quote')&&['full','quote','batch'].includes(run.scope))next.quote.checked_at=at;
  if(['full','ecosystem','batch'].includes(run.scope)&&catalog.required_companies.every(c=>accepted.has('company:'+c)))next.ecosystem.checked_at=at;
  for(const c of next.ecosystem.companies){const old=previous.ecosystem.companies.find(x=>x.id===c.id);c.checked_at=financialAccepted.has('company:'+c.id)?at.slice(0,10):old?.checked_at||c.checked_at;}
  for(const m of next.metrics){const old=previous.metrics.find(x=>x.id===m.id),key=m.category==='industry'?'industry':'micron';m.checked_at=financialAccepted.has(key)?at.slice(0,10):old?.checked_at||m.checked_at;}
  deriveDiscovery(previous,next,run,catalog);
  for(const [id,s]of Object.entries(next.sources)){
    const read=run.reads.find(r=>r.source_id===id&&r.status==='read'&&r.reviewed_at);
    s.checked_at=read?read.reviewed_at.slice(0,10):previous.sources[id]?.checked_at||s.checked_at;
  }
  next.revision=run.revision||`${at.slice(0,10)}-${hash({proposal:next,base:run.base_sha256}).slice(0,10)}`;
  if(next.revision===previous.revision)add('REVISION','revision','A new run needs a distinct revision');
  next.check_log=[{at,status:complete?'success':accepted.size?'partial':'failed',scope:run.scope,text:run.summary||`核查范围：${run.scope}；完成 ${accepted.size} / ${scopeKeys(run.scope,catalog,run.targets).length} 项。`},...previous.check_log].slice(0,100);
  let ledger=recordDocument(next,catalog,previousLedger),evidence=clone(previousEvidence);
  for(const [id,payload]of Object.entries(supporting)){
    const record=makeRecord({metric_id:id,payload,context:{entity:'micron',financial_period:next.financial_period,period_end:next.financial_as_of}},next,catalog);
    record.evidence_ids=previousLedger.records[record.id]?.evidence_ids||[];ledger.records[record.id]=record;ledger.supporting[id]=record.id;
  }
  const uncaptured=doc=>{const read=run.reads.find(r=>r.source_id===doc.source_id&&r.status==='read');return !read||read.sha256!==doc.sha256||read.url!==doc.url||read.access!==doc.access||read.accessed_at!==doc.accessed_at||!read.reviewed_at;};
  const tracked=catalog.series?.metrics||[],observed=catalog.series?.observations?.metrics||[],setPoint=(metric_id,period,id)=>{ledger.series??={};(ledger.series[metric_id]??={})[period]=id;};
  // A quarter rollover keeps the outgoing quarter's record as a past-quarter point, so trend lines grow without re-entry.
  if(next.financial_period!==previous.financial_period){
    const outgoing=new Map(activeRecords(previousLedger).map(r=>[r.metric_id,r]));
    for(const metric_id of tracked){const r=outgoing.get(metric_id);if(r?.context.financial_period&&r.context.financial_period!==next.financial_period&&typeof r.payload.current==='number')setPoint(metric_id,r.context.financial_period,r.id);}
  }
  // A newer industry reading keeps the one it replaces as a dated point; a same-date correction does not.
  {
    const outgoing=new Map(activeRecords(previousLedger).map(r=>[r.metric_id,r])),incoming=new Map(activeRecords(ledger).map(r=>[r.metric_id,r]));
    for(const metric_id of observed){
      const old=outgoing.get(metric_id),now=incoming.get(metric_id);
      if(!now||old?.id===now.id)continue;
      if(!isObservationDate(now.payload.as_of)){add('OBSERVATION_DATE',metric_id,'A new industry reading needs as_of: the date (YYYY-MM-DD) or month (YYYY-MM) it describes');continue;}
      const key=old?.payload.as_of;
      if(!isObservationDate(key))continue;
      const order=compareDates(key,now.payload.as_of);
      if(order===null||order>0){add('OBSERVATION_DATE',metric_id,'A new reading cannot predate the live one or change its date format');continue;}
      if(order<0&&typeof old.payload.current==='number'&&!ledger.series?.[metric_id]?.[key])setPoint(metric_id,key,old.id);
    }
  }
  // Backfilled points reuse an existing evidenced record or add a new one with its own reviewed evidence.
  for(const [metric_id,periods] of Object.entries(history))for(const [period,point] of Object.entries(periods)){
    const key=`${metric_id}@${period}`,def=catalog.definitions[metric_id],industry=observed.includes(metric_id);
    if(!(tracked.includes(metric_id)||industry)||!def){add('SERIES_METRIC',key,'Only catalog series metrics can hold past points');continue;}
    // Reusing an already-evidenced record adds no new fact, so a maintenance run may do it; new points need a run scoped to the metric.
    if(!(point.record_id&&run.scope==='maintenance')&&!inScope(metric_id)){add('SCOPE',key,'Series point is outside this run scope');continue;}
    let record=point.record_id?previousLedger.records[point.record_id]:null;
    if(point.record_id&&!record){add('SERIES_RECORD',key,'Referenced record does not exist');continue;}
    if(!record){
      const context=industry?{entity:'industry',as_of:period}:{entity:'micron',financial_period:period,period_end:point.period_end};
      record={metric_id,definition_version:def.version,context:{...context,measurement:def.measurement,unit:def.unit,scope:def.scope,accounting_basis:def.accounting_basis,temporal_basis:def.temporal_basis,sources:clone(point.sources||[])},payload:clone(point.payload),evidence_ids:[]};
      record.id=recordHash(record);
      const old=previousLedger.records[record.id],input=evidenceInput[key];
      if(old)record.evidence_ids=clone(old.evidence_ids);
      else if(!input)add('EVIDENCE_REQUIRED',key,'New series points require reviewed evidence');
      else{
        const e={...clone(input),mode:'verified',record_hash:record.id};
        if((e.documents||[]).some(uncaptured))add('UNCAPTURED_SOURCE',key,'Evidence must match the content, URL, access level and time of a source captured and reviewed during this run');
        e.id=`e-${hash(e)}`;evidence[e.id]=e;record.evidence_ids=[e.id];
      }
      ledger.records[record.id]=record;
    }
    const existing=ledger.series?.[metric_id]?.[period];
    if(existing&&existing!==record.id){add('SERIES_HISTORY',key,'A published point cannot be replaced');continue;}
    setPoint(metric_id,period,record.id);
  }
  const current=activeRecords(ledger),byId=new Map(current.map(r=>[r.metric_id,r]));
  for(const record of current) {
    const old=previousLedger.records[record.id],input=evidenceInput[record.metric_id];
    if(old&&!input)continue;
    if(!old&&!inScope(record.metric_id))add('SCOPE',record.metric_id,'Changed record is outside this run scope');
    const calculation=catalog.calculations.find(r=>r.target===record.metric_id);
    let e;
    if(calculation)e={mode:'calculated',record_hash:record.id,inputs:calculation.inputs.map(id=>byId.get(id)?.id),formula:calculation.op};
    else if(input){
      e={...clone(input),mode:'verified',record_hash:record.id};
      for(const doc of e.documents||[])if(uncaptured(doc))add('UNCAPTURED_SOURCE',record.metric_id,'Evidence must match the content, URL, access level and time of a source captured and reviewed during this run');
    }else{add('EVIDENCE_REQUIRED',record.metric_id,'New or changed records require reviewed evidence');continue;}
    e.id=`e-${hash(e)}`;evidence[e.id]=e;record.evidence_ids=[...new Set([...(old?.evidence_ids||[]),e.id])];
  }
  for(const c of next.ecosystem.companies){const old=previous.ecosystem.companies.find(x=>x.id===c.id);if(old&&changedCompany(old,c)&&!accepted.has('company:'+c.id))add('COMPANY_COVERAGE',c.id,'Changed company needs completed source coverage');}
  next=materialize(ledger);
  issues.push(...validateLedger(ledger,catalog,evidence,legacy),...validateTransition(previous,next,run,catalog));
  // A rollover is complete only when all its active financial records have fresh evidence.
  for(const entity of run.report_bundle)for(const record of current.filter(r=>r.context.entity===entity)) {
    if(record.evidence_ids.some(id=>evidence[id]?.mode==='legacy'))add('REPORT_BUNDLE',record.metric_id,'New financial report still contains a migrated record');
  }
  if(next.financial_period!==previous.financial_period&&next.expected_report_review_by===previous.expected_report_review_by)add('REVIEW_DEADLINE','expected_report_review_by','Quarter rollover must refresh or clear the next-report deadline');
  run.state=issues.length?'blocked':'verified';run.result=complete?'success':accepted.size?'partial':'failed';
  const receipt={...run,artifact_sha256:hash(next),ledger_sha256:hash(ledger),evidence_sha256:hash(evidence)};
  return {document:next,ledger,evidence,receipt,issues};
}
