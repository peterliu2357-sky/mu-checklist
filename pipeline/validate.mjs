import fs from 'node:fs';
import Ajv from 'ajv';
import {fileURLToPath} from 'node:url';
import {activeRecords,entries,materialize,makeRecord,recordHash,hash,stable,compute,orderedCalculations} from './model.mjs';

const schema=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../schemas/monitor.schema.json',import.meta.url))));
const shape=new Ajv({allErrors:true,strict:true,allowUnionTypes:true}).compile(schema);
const forbidden=new Set(['judgment','headline','trigger','trigger_status','valuation','investment_score']);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const equal=(a,b)=>stable(a)===stable(b);

export function validateDocument(document,catalog) {
  const issues=[];
  const add=(code,path,message)=>issues.push({code,path,message});
  for(const rule of [...catalog.calculations,...catalog.reconciliations]){
    const inputs=rule.inputs.map(id=>catalog.definitions[id]);
    if(inputs.some(d=>!d)||!catalog.definitions[rule.target])add('FORMULA_DEFINITION',rule.target,'Every formula input and target must be registered');
    else if(new Set(inputs.map(d=>d.unit)).size!==1)add('FORMULA_UNIT',rule.target,'Formula inputs must have compatible units');
  }
  try{orderedCalculations(catalog.calculations);}catch(error){add('FORMULA_CYCLE','catalog',error.message);}
  if(!shape(document)) {
    for(const error of shape.errors)add('SCHEMA',error.instancePath,`${error.message} ${JSON.stringify(error.params)}`);
    return issues;
  }
  function walk(value,path='') {
    if(Array.isArray(value))return value.forEach((v,i)=>walk(v,`${path}/${i}`));
    if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(forbidden.has(k))add('FORBIDDEN_FIELD',`${path}/${k}`,'Investment judgments are not data fields');walk(v,`${path}/${k}`);}
  }
  walk(document);
  const list=entries(document,catalog),seen=new Set();
  for(const entry of list) {
    const {metric_id:id,payload:r}=entry,def=catalog.definitions[id];
    if(seen.has(id))add('DUPLICATE',id,'Duplicate metric identity');seen.add(id);
    if(!def||!def.active){add('UNREGISTERED',id,'Register or activate this metric in the catalog');continue;}
    if(r.unit!==undefined&&r.unit!==def.unit)add('UNIT',id,`Expected ${def.unit}, received ${r.unit}`);
    if(r.evidence_type&&!def.evidence_types.includes(r.evidence_type))add('EVIDENCE_TYPE',id,'Evidence type is incompatible with the metric definition');
    if(r.kind&&def.nature==='forecast'&&!/预测|指引|计划/.test(r.kind))add('FORECAST_AS_ACTUAL',id,'Forecasts must retain their forecast label');
    if(r.current===null&&r.evidence_type!=='unavailable')add('MISSING_VALUE',id,'A missing value must be explicitly unavailable');
    const ids=r.source_ids||(r.source_id?[r.source_id]:[]);
    if(!ids.length)add('SOURCE',id,'A source or explicit gap source is required');
    for(const sid of ids) {
      if(!document.sources[sid])add('SOURCE',id,`Missing source ${sid}`);
      if(!catalog.source_roles[sid]?.includes(id))add('SOURCE_ROLE',id,`${sid} is not registered as evidence for this measurement`);
    }
    if(id.startsWith('mu.volume.')&&r.evidence_type!=='direct')add('SHIPMENT',id,'Shipment metrics require direct shipment disclosure');
    if(id.startsWith('mu.demand.')&&r.evidence_type!=='unavailable'&&r.evidence_type!=='proxy')add('PROXY',id,'Indirect end-consumption observations require a proxy label');
  }
  for(const [id,def]of Object.entries(catalog.definitions))if(def.active&&def.required&&!def.supporting&&!seen.has(id))add('COVERAGE',id,'Required metric missing');
  const companyIds=document.ecosystem.companies.map(c=>c.id);
  for(const id of catalog.required_companies)if(!companyIds.includes(id))add('COMPANY_COVERAGE',id,'Required company missing');
  if(new Set(companyIds).size!==companyIds.length)add('DUPLICATE','ecosystem','Duplicate company');
  for(const c of document.ecosystem.companies){
    if(!catalog.companies[c.id])add('UNREGISTERED_COMPANY',c.id,'Company must have a discovery adapter');
    if(c.period===c.previous_period)add('PERIOD',c.id,'Current and prior periods must differ');
    const q=/^(FY)?(\d{4}) Q([1-4])$/.exec(c.period),p=/^(FY)?(\d{4}) Q([1-4])$/.exec(c.previous_period);
    if(!q||!p||q[1]!==p[1]||Number(q[2])-Number(p[2])!==1||q[3]!==p[3])add('YOY_PERIOD',c.id,'Comparison must use the same quarter and calendar basis in the prior year');
    if(!document.ecosystem.groups.some(g=>g.id===c.group)||catalog.companies[c.id]?.group!==c.group)add('GROUP',c.id,'Company group differs from the registry');
    if(!date(c.period_end)||!date(c.published_at)||!date(c.checked_at))add('DATE',c.id,'Invalid company dates');
    if(Date.parse(c.period_end)>Date.parse(c.published_at))add('DATE',c.id,'Report cannot precede period end');
  }
  for(const m of document.metrics)if(!catalog.required_sections.includes(m.id)) {
    if(!catalog.optional_sections?.includes(m.id))add('SECTION',m.id,'Register the new section');
  }
  for(const id of catalog.required_sections)if(!document.metrics.some(m=>m.id===id))add('SECTION',id,'Required section missing');
  const resolve=ref=>document.metrics.find(m=>m.id===ref.metric_id)?.rows.find(r=>r.id===ref.row_id);
  for(const card of document.overview.fact_cards)if(!resolve(card))add('REFERENCE','overview',`Missing stable row reference ${card.metric_id}/${card.row_id}`);
  function quarter(p){const m=/^FY(\d{4})\s+Q([1-4])$/.exec(p);return m?Number(m[1])*4+Number(m[2]):null;}
  for(const g of document.guidance) {
    const periods=g.actuals.map(a=>quarter(a.period)),target=quarter(g.period);
    if(periods.some(x=>x===null)||target===null||periods[1]!==periods[0]+1||target!==periods[1]+1)add('GUIDANCE_PERIOD',g.id,'Expected two consecutive actual quarters followed by guidance');
    if(g.actuals[0].field!=='previous'||g.actuals[1].field!=='current')add('GUIDANCE_REFERENCE',g.id,'Actuals must run from previous to current');
    if(g.actuals[1].period!==document.financial_period)add('GUIDANCE_PERIOD',g.id,'Latest actual must match the financial reporting period');
    for(const ref of g.actuals){const r=resolve(ref);if(!r||!finite(r[ref.field])||r.unit!==g.unit)add('GUIDANCE_REFERENCE',g.id,'Unresolved or incomparable actual');}
  }
  for(const field of ['updated_at','last_successful_check_at','last_attempt_at','financial_as_of','financial_published_at'])if(!date(document[field]))add('DATE',field,'Invalid date');
  if(document.quote.session!=='regular_close')add('QUOTE_SESSION','quote','Only a regular trading close is allowed');
  if(Date.parse(document.last_successful_check_at)>Date.parse(document.last_attempt_at))add('CHECK_TIME','last_successful_check_at','Successful check cannot be later than its attempt');
  return issues;
}

export function validateLedger(ledger,catalog,evidence,legacy) {
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  let document;
  try{document=materialize(ledger);}catch(error){return [{code:'RECORD',path:'ledger',message:error.message}];}
  issues.push(...validateDocument(document,catalog));
  const active=activeRecords(ledger),byMetric=new Map(active.map(r=>[r.metric_id,r]));
  for(const entry of entries(document,catalog)) {
    if(!catalog.definitions[entry.metric_id])continue;
    const expected=makeRecord(entry,document,catalog),actual=byMetric.get(entry.metric_id);
    if(!actual||expected.id!==actual.id)add('CONTEXT_BINDING',entry.metric_id,'Record context or source identity does not match the published period/definition');
  }
  for(const r of active) {
    if(recordHash(r)!==r.id)add('RECORD_HASH',r.metric_id,'Record content was altered without a new identity');
    const def=catalog.definitions[r.metric_id];
    if(!def||r.definition_version!==def.version){add('DEFINITION_VERSION',r.metric_id,'Record uses a different definition version');continue;}
    if(!r.evidence_ids.length)add('EVIDENCE_REQUIRED',r.metric_id,'Record has no evidence');
    for(const id of r.evidence_ids) {
      const e=evidence[id];
      if(!e){add('EVIDENCE_REQUIRED',r.metric_id,`Missing evidence ${id}`);continue;}
      if(e.record_hash!==r.id)add('EVIDENCE_BINDING',r.metric_id,'Evidence is bound to a different fact');
      if(e.mode==='legacy') {
        if(!legacy.record_hashes.includes(r.id)||!legacy.evidence_hashes.includes(hash(e)))add('LEGACY_CHANGED',r.metric_id,'Only the frozen migration baseline can retain legacy evidence');
        continue;
      }
      if(e.mode==='calculated') {
        const rule=catalog.calculations.find(x=>x.target===r.metric_id);
        if(!rule||!equal(e.inputs,rule.inputs.map(id=>byMetric.get(id)?.id)))add('FORMULA_LINEAGE',r.metric_id,'Calculated evidence must reference the active formula inputs');
        continue;
      }
      if(e.mode!=='verified'){add('EVIDENCE_MODE',r.metric_id,'Unknown evidence mode');continue;}
      if(!e.review?.confirmed||!e.review?.method||!date(e.review?.at))add('SOURCE_REVIEW',r.metric_id,'Original-source correspondence must be reviewed');
      if(!Array.isArray(e.documents)||!e.documents.length){add('SOURCE_REVIEW',r.metric_id,'No captured source documents');continue;}
      const sourceIds=r.payload.source_ids||(r.payload.source_id?[r.payload.source_id]:[]);
      for(const sid of sourceIds)if(!e.documents.some(doc=>doc.source_id===sid))add('SOURCE_REVIEW',r.metric_id,`Evidence missing for source ${sid}`);
      for(const doc of e.documents) {
        if(!/^[a-f0-9]{64}$/.test(doc.sha256||'')||!date(doc.accessed_at)||!doc.locator||!doc.excerpt?.trim()||doc.excerpt.length>1500)add('SOURCE_CAPTURE',r.metric_id,'Capture needs content hash, read time, locator and concise excerpt');
        if(!['full','abstract','secondary'].includes(doc.access))add('ACCESS',r.metric_id,'Declare which source content was actually read');
        if(doc.url!==document.sources[doc.source_id]?.url)add('SOURCE_URL',r.metric_id,'Evidence URL differs from the published source');
        if(doc.access==='abstract'&&!/摘要/.test((r.payload.note||'')+' '+(document.sources[doc.source_id]?.type||'')))add('ABSTRACT',r.metric_id,'Public abstract access must be visible to readers');
        if(doc.access==='secondary'&&r.payload.evidence_type!=='secondary')add('SECONDARY',r.metric_id,'Secondary reporting cannot be relabeled direct');
      }
      if(e.measurement!==def.measurement||e.unit!==def.unit||e.definition_version!==def.version)add('SEMANTICS',r.metric_id,'Evidence measurement/unit/version differs from the metric definition');
      if(e.temporal_basis!==def.temporal_basis||e.accounting_basis!==def.accounting_basis||e.scope!==def.scope)add('SEMANTICS',r.metric_id,'Evidence period basis, accounting basis and entity scope must match the definition');
      if(!equal(e.values,{current:r.payload.current??null,previous:r.payload.previous??null,value:r.payload.value??null,summary:r.payload.summary??null}))add('SOURCE_VALUES',r.metric_id,'Evidence values must match the candidate fact');
      const numericFields=['current','previous','price','previous_close'].filter(field=>finite(r.payload[field]));
      for(const field of numericFields){
        const input=e.raw_inputs?.find(x=>x.field===field);
        if(!input||!finite(input.value)||!finite(input.scale)||!input.source_unit||!input.period||!input.locator||!sourceIds.includes(input.source_id))add('RAW_INPUT',`${r.metric_id}.${field}`,'Preserve the source value, unit, period, locator and explicit scale');
        else if(Math.abs(input.value*input.scale-r.payload[field])>Math.max(1,Math.abs(r.payload[field]))*1e-10)add('NORMALIZATION',`${r.metric_id}.${field}`,'Raw value and scale do not produce the published value');
      }
    }
  }
  const value=(id,field)=>byMetric.get(id)?.payload[field];
  for(const rule of [...catalog.calculations,...catalog.reconciliations])for(const field of ['current','previous']) {
    try {
      const expected=compute(rule.op,rule.inputs.map(id=>value(id,field))),actual=value(rule.target,field);
      if(!finite(actual)||Math.abs(actual-expected)>Math.max(1,Math.abs(expected))*1e-10)add('RECONCILIATION',`${rule.target}.${field}`,`Expected ${expected}; received ${actual}`);
    }catch(error){add('FORMULA',rule.target,error.message);}
  }
  return issues;
}

export function validateTransition(previous,next,manifest,catalog) {
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  const scopes=manifest.scope==='full'?['micron','industry','quote','ecosystem']: [manifest.scope];
  const successful=(manifest.coverage||[]).filter(c=>['verified','unchanged','gap'].includes(c.status));
  const required=scopes.flatMap(s=>s==='ecosystem'?catalog.required_companies.map(c=>'company:'+c):[s]);
  for(const key of required)if(!manifest.coverage?.some(c=>c.key===key))add('RUN_COVERAGE',key,'Every required scope needs an explicit result');
  for(const c of successful){
    if(!c.evidence?.length||!c.reviewed_at||!c.latest_disclosure?.url||!c.latest_disclosure?.published_at)add('DISCOVERY',c.key,'Successful coverage requires source reads and latest-disclosure identification');
    for(const sid of c.evidence||[])if(!manifest.reads?.some(r=>r.source_id===sid&&r.status==='read'&&r.reviewed_at&&r.sha256))add('DISCOVERY_READ',c.key,'Coverage references a source not actually read');
  }
  const completed=required.every(key=>successful.some(c=>c.key===key));
  if(next.last_successful_check_at!==previous.last_successful_check_at&&!(manifest.scope==='full'&&completed))add('FALSE_FRESHNESS','last_successful_check_at','Full success requires complete coverage');
  if(next.financial_period!==previous.financial_period) {
    if(!manifest.report_bundle?.includes('micron'))add('REPORT_BUNDLE','micron','A new quarter requires a complete report bundle');
    if(next.financial_as_of===previous.financial_as_of||next.financial_published_at===previous.financial_published_at)add('REPORT_BUNDLE','micron','Quarter rollover requires the new report dates');
  }
  for(const c of next.ecosystem.companies) {
    const old=previous.ecosystem.companies.find(x=>x.id===c.id);
    if(old&&c.period!==old.period&&!manifest.report_bundle?.includes(c.id))add('REPORT_BUNDLE',c.id,'Quarter rollover requires a company report bundle');
    const result=manifest.coverage?.find(x=>x.key==='company:'+c.id);
    if(old&&result&&['failed','pending'].includes(result.status)&&!equal(old,c))add('FAILED_SCOPE_CHANGED',c.id,'Failed or pending company must retain its prior complete report');
  }
  const reads=new Set((manifest.reads||[]).filter(r=>r.status==='read'&&r.sha256&&r.reviewed_at).map(r=>r.source_id));
  if(manifest.scope==='full'&&completed)for(const id of Object.keys(next.sources))if(!reads.has(id))add('FULL_SOURCE_COVERAGE',id,'Full source review requires an explicit read receipt for every published source');
  for(const [id,source]of Object.entries(next.sources)) {
    if(source.checked_at!==previous.sources[id]?.checked_at&&!reads.has(id))add('UNREAD_DATE',id,'Only an actual source read may advance checked_at');
    if(previous.sources[id]&&source.url===previous.sources[id].url&&source.published_at!==previous.sources[id].published_at&&!manifest.publication_corrections?.includes(id))add('PUBLICATION_DATE',id,'Same document publication date changed without an explicit correction');
  }
  if(manifest.scope==='source_audit'&&(next.last_successful_check_at!==previous.last_successful_check_at||next.quote.checked_at!==previous.quote.checked_at))add('AUDIT_SCOPE','dates','Source audit cannot advance full or quote checks');
  if(next.revision===previous.revision&&hash(next)!==hash(previous))add('REVISION','revision','Changed content must have a distinct revision');
  return issues;
}
