import {clone,hash,stable,materialize,recordDocument,makeRecord,activeRecords,calculate} from './model.mjs';
import {validateLedger,validateTransition} from './validate.mjs';

export const scopeKeys=(scope,catalog)=>scope==='full'?['micron','industry','quote',...catalog.required_companies.map(c=>'company:'+c)]:scope==='ecosystem'?catalog.required_companies.map(c=>'company:'+c):[scope];
export function createManifest({scope='full',base_commit,document,catalog,at}) {
  if(!['full','micron','industry','quote','ecosystem','source_audit'].includes(scope))throw new Error('Unknown scope');
  return {version:1,scope,base_commit,base_revision:document.revision,base_sha256:hash(document),catalog_sha256:hash(catalog),created_at:at,completed_at:null,state:'planned',
    coverage:scopeKeys(scope,catalog).map(key=>({key,status:'pending',evidence:[],reviewed_at:null,latest_disclosure:null,reason:''})),reads:[],report_bundle:[],publication_corrections:[]};
}

function changedCompany(old,next){return stable({...old,checked_at:null})!==stable({...next,checked_at:null});}
function issue(code,path,message){return {code,path,message};}
export function buildCandidate({previousLedger,previousEvidence,proposal,supporting,evidenceInput,manifest,catalog,legacy}) {
  const previous=materialize(previousLedger),run=clone(manifest),at=run.completed_at;
  if(!at||!Number.isFinite(Date.parse(at)))throw new Error('completed_at must be fixed before building');
  if(hash(previous)!==run.base_sha256)throw new Error('BASE_CHANGED: run was prepared against different data');
  if(hash(catalog)!==run.catalog_sha256)throw new Error('CATALOG_CHANGED: start a new run after catalog changes');
  const issues=[],add=(...x)=>issues.push(issue(...x));
  const accepted=new Set(run.coverage.filter(c=>['verified','unchanged','gap'].includes(c.status)).map(c=>c.key));
  const complete=scopeKeys(run.scope,catalog).every(k=>accepted.has(k));
  const next=calculate(proposal,catalog,supporting);
  if(run.scope==='source_audit'){
    const numeric=v=>{const out={};function walk(x,p){if(typeof x==='number')out[p]=x;else if(x&&typeof x==='object')for(const[k,item]of Object.entries(x))walk(item,p+'/'+k);}walk(v,'');return stable(out);};
    if(numeric(proposal)!==numeric(previous))add('AUDIT_SCOPE','proposal','A source-only audit cannot change numeric facts');
  }
  const inScope=id=>run.scope==='full'||run.scope==='source_audit'||(run.scope==='ecosystem'&&(id.startsWith('eco.')||id.startsWith('outlook.')))||(run.scope==='quote'&&id==='quote.mu')||(run.scope==='industry'&&/^mu\.(contract|supply|demand)\./.test(id))||(run.scope==='micron'&&(!/^(eco|outlook|quote)\./.test(id)&&!/^mu\.(contract|supply|demand)\./.test(id)));
  // Dates come from source-read receipts and completed coverage, never from the proposed JSON.
  next.updated_at=at;next.last_successful_check_at=previous.last_successful_check_at;next.last_attempt_at=previous.last_attempt_at;next.last_source_audit_at=previous.last_source_audit_at;
  next.quote.checked_at=previous.quote.checked_at;next.ecosystem.checked_at=previous.ecosystem.checked_at;
  if(run.scope==='full'){next.last_attempt_at=at;if(complete)next.last_successful_check_at=at;}
  if(run.scope==='source_audit'&&complete)next.last_source_audit_at=at;
  if(accepted.has('quote')&&['full','quote'].includes(run.scope))next.quote.checked_at=at;
  if(['full','ecosystem'].includes(run.scope)&&catalog.required_companies.every(c=>accepted.has('company:'+c)))next.ecosystem.checked_at=at;
  for(const c of next.ecosystem.companies){const old=previous.ecosystem.companies.find(x=>x.id===c.id);c.checked_at=accepted.has('company:'+c.id)?at.slice(0,10):old?.checked_at||c.checked_at;}
  for(const m of next.metrics){const old=previous.metrics.find(x=>x.id===m.id),key=m.category==='industry'?'industry':'micron';m.checked_at=accepted.has(key)?at.slice(0,10):old?.checked_at||m.checked_at;}
  for(const [id,s]of Object.entries(next.sources)){
    const read=run.reads.find(r=>r.source_id===id&&r.status==='read'&&r.reviewed_at);
    s.checked_at=read?read.reviewed_at.slice(0,10):previous.sources[id]?.checked_at||s.checked_at;
  }
  next.revision=run.revision||`${at.slice(0,10)}-${hash({proposal:next,base:run.base_sha256}).slice(0,10)}`;
  if(next.revision===previous.revision)add('REVISION','revision','A new run needs a distinct revision');
  next.check_log=[{at,status:complete?'success':accepted.size?'partial':'failed',scope:run.scope,text:run.summary||`核查范围：${run.scope}；完成 ${accepted.size} / ${scopeKeys(run.scope,catalog).length} 项。`},...previous.check_log].slice(0,100);
  let ledger=recordDocument(next,catalog,previousLedger),evidence=clone(previousEvidence);
  for(const [id,payload]of Object.entries(supporting)){
    const record=makeRecord({metric_id:id,payload,context:{entity:'micron',financial_period:next.financial_period,period_end:next.financial_as_of}},next,catalog);
    record.evidence_ids=previousLedger.records[record.id]?.evidence_ids||[];ledger.records[record.id]=record;ledger.supporting[id]=record.id;
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
      for(const doc of e.documents||[]){const read=run.reads.find(r=>r.source_id===doc.source_id&&r.status==='read');if(!read||read.sha256!==doc.sha256||read.url!==doc.url||read.access!==doc.access||read.accessed_at!==doc.accessed_at||!read.reviewed_at)add('UNCAPTURED_SOURCE',record.metric_id,'Evidence must match the content, URL, access level and time of a source captured and reviewed during this run');}
    }else{add('EVIDENCE_REQUIRED',record.metric_id,'New or changed records require reviewed evidence');continue;}
    e.id=`e-${hash(e)}`;evidence[e.id]=e;record.evidence_ids=[...new Set([...(old?.evidence_ids||[]),e.id])];
  }
  for(const c of next.ecosystem.companies){const old=previous.ecosystem.companies.find(x=>x.id===c.id);if(old&&changedCompany(old,c)&&!accepted.has('company:'+c.id))add('COMPANY_COVERAGE',c.id,'Changed company needs completed source coverage');}
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
