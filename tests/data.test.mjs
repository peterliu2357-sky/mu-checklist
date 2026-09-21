import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import core from '../lib/monitor-core.js';
import {clone,hash,stable,materialize,recordDocument,activeRecords,calculate,compute} from '../pipeline/model.mjs';
import {validateDocument,validateLedger,validateTransition} from '../pipeline/validate.mjs';
import {createManifest,buildCandidate} from '../pipeline/run.mjs';
import {fetchSource} from '../pipeline/acquire.mjs';
import {validateEvolution} from '../pipeline/evolution.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const ledger=read('data/ledger.json'),catalog=read('pipeline/catalog.json'),evidence=read('data/evidence.json'),legacy=read('pipeline/legacy-baseline.json'),baseline=read('tests/fixtures/baseline.json');
const d=materialize(ledger),supporting=Object.fromEntries(Object.entries(ledger.supporting).map(([id,ref])=>[id,ledger.records[ref].payload]));
const mutation=(fn)=>{const c=clone(d);fn(c);return c;};
const has=(issues,code)=>assert(issues.some(x=>x.code===code),JSON.stringify(issues));
const row=(doc,id,short)=>doc.metrics.find(m=>m.id===id).rows.find(r=>r.id===short);

test('canonical records compile exactly to the published schema-2 data',()=>{assert.deepEqual(validateLedger(ledger,catalog,evidence,legacy),[]);assert.deepEqual(d,read('data/monitor.json'));});
test('historical expected financial facts remain independently fixed',()=>{
  assert.equal(row(baseline,'inventory','finished_goods').current,621);assert.equal(row(baseline,'inventory','total').previous,8267);
  assert.equal(row(baseline,'cash','adjusted_fcf').current,18304);assert.equal(row(baseline,'capex','net').previous,5004);
  assert.equal(baseline.ecosystem.companies.find(c=>c.id==='microsoft').metrics.find(r=>r.id==='azure_revenue').current,29417);
});
test('required company removal fails',()=>has(validateDocument(mutation(c=>c.ecosystem.companies.pop()),catalog),'COMPANY_COVERAGE'));
test('missing required metric fails',()=>has(validateDocument(mutation(c=>c.metrics.find(m=>m.id==='inventory').rows.pop()),catalog),'COVERAGE'));
test('shipment cannot cite revenue source',()=>has(validateDocument(mutation(c=>row(c,'volume','dram_bits').source_ids=['financial']),catalog),'SOURCE_ROLE'));
test('investment judgment fields are rejected',()=>has(validateDocument(mutation(c=>c.metrics[0].judgment='example'),catalog),'SCHEMA'));
test('currency substitution fails',()=>has(validateDocument(mutation(c=>c.ecosystem.companies.find(c=>c.id==='samsung').metrics[0].unit='USDm'),catalog),'UNIT'));
test('quarterly and annual comparison cannot silently change',()=>has(validateDocument(mutation(c=>c.ecosystem.companies[0].previous_period='FY2025'),catalog),'YOY_PERIOD'));
test('forecast labels cannot become actuals',()=>has(validateDocument(mutation(c=>c.guidance[0].kind='实际'),catalog),'FORECAST_AS_ACTUAL'));
test('end consumption proxy cannot become direct',()=>has(validateDocument(mutation(c=>row(c,'demand','ssd_industry_revenue').evidence_type='direct'),catalog),'PROXY'));
test('null is not zero',()=>has(validateDocument(mutation(c=>row(c,'inventory','total').current=null),catalog),'MISSING_VALUE'));
test('dangling overview references fail',()=>has(validateDocument(mutation(c=>c.overview.fact_cards[0].row_id='missing'),catalog),'REFERENCE'));
test('guidance requires sequential quarter references',()=>has(validateDocument(mutation(c=>c.guidance[0].actuals[0].period='FY2025 Q4'),catalog),'GUIDANCE_PERIOD'));
test('guidance percent and percentage-point arithmetic are distinct',()=>{assert(Math.abs(core.guidanceComparison(baseline.guidance[0],baseline).value-20.6098031648)<1e-8);assert(Math.abs(core.guidanceComparison(baseline.guidance[1],baseline).value-1.1)<1e-8);});
test('stable IDs survive display label edits',()=>{const c=clone(baseline);row(c,'revenue','total').label='集团营收';assert.equal(core.guidanceActuals(c.guidance[0],c)[1].value,41456);});
test('inventory reconciliation rejects a one-dollar-in-millions mistake',()=>{const c=recordDocument(mutation(c=>row(c,'inventory','total').current++),catalog,ledger);has(validateLedger(c,catalog,evidence,legacy),'RECONCILIATION');});
test('changed records cannot borrow legacy evidence',()=>{const c=recordDocument(mutation(c=>row(c,'inventory','total').current++),catalog,ledger),r=activeRecords(c).find(r=>r.metric_id==='mu.inventory.total');r.evidence_ids=activeRecords(ledger).find(old=>old.metric_id===r.metric_id).evidence_ids;has(validateLedger(c,catalog,evidence,legacy),'EVIDENCE_BINDING');});
test('missing new evidence blocks publication',()=>{const c=recordDocument(mutation(c=>c.ecosystem.companies[0].metrics[0].current++),catalog,ledger);has(validateLedger(c,catalog,evidence,legacy),'EVIDENCE_REQUIRED');});
test('record content hashes detect in-place edits',()=>{const c=clone(ledger),r=activeRecords(c)[0];r.payload.current='changed';has(validateLedger(c,catalog,evidence,legacy),'RECORD_HASH');});
test('formula results replay independently of input order',()=>{const c=read('tests/fixtures/formulas.json');c.calculations.reverse();const got=calculate(baseline,c,read('tests/fixtures/supporting.json'));for(const [m,id,value]of [['inventory','receivables_revenue',26894/41456*100],['cash','gross_fcf',17562],['capex','net_cash',24406]])assert.equal(row(got,m,id).current,value);});
test('formula cycles fail',()=>{const c=clone(catalog);c.calculations.push({target:'mu.revenue.total',op:'sum',inputs:['mu.inventory.receivables_revenue']});assert.throws(()=>calculate(d,c,supporting),/cycle/);});
test('formula refuses a zero denominator',()=>assert.throws(()=>compute('ratio',[5,0]),/Zero/));
test('mixed-currency formula inputs fail',()=>{const c=clone(catalog);c.calculations[0].inputs[1]='eco.samsung.revenue';has(validateDocument(d,c),'FORMULA_UNIT');});
test('new registered metric extends the pipeline without code changes',()=>{
  const c=clone(catalog),doc=clone(d),id='mu.inventory.example';c.definitions[id]={...c.definitions['mu.inventory.days'],scope:'example'};c.source_roles.inventory_days.push(id);doc.metrics.find(m=>m.id==='inventory').rows.push({...row(doc,'inventory','days'),id:'example'});assert.deepEqual(validateDocument(doc,c),[]);
});
test('new company is controlled by registry coverage, not a hardcoded count',()=>{
  const c=clone(catalog),doc=clone(d),company=clone(doc.ecosystem.companies[0]);company.id='example';c.required_companies.push('example');c.companies.example={...c.companies.microsoft};
  for(const [kind,rows]of [['eco',company.metrics],['outlook',company.outlook]])for(const r of rows){const id=`${kind}.example.${r.id}`;c.definitions[id]={...c.definitions[`${kind}.microsoft.${r.id}`],entity:'example'};for(const sid of r.source_ids)c.source_roles[sid].push(id);}
  doc.ecosystem.companies.push(company);assert.deepEqual(validateDocument(doc,c),[]);doc.ecosystem.companies.pop();has(validateDocument(doc,c),'COMPANY_COVERAGE');
});

const at=new Date(Date.parse(d.updated_at)+86400000).toISOString();
const manifest=scope=>({...createManifest({scope,base_commit:'a'.repeat(40),document:d,catalog,at}),completed_at:at});
test('partial run retains the old full-success timestamp',()=>{const m=manifest('full'),proposal=clone(d);proposal.last_successful_check_at=at;const r=buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal,supporting,evidenceInput:{},manifest:m,catalog,legacy});assert.equal(r.document.last_successful_check_at,d.last_successful_check_at);assert.equal(r.receipt.result,'failed');assert.equal(r.document.check_log[0].status,'failed');assert.deepEqual(r.issues,[]);});
test('failure does not erase previously verified values',()=>{const before=hash(ledger),m=manifest('ecosystem');m.coverage[0].status='failed';const proposal=clone(d);proposal.ecosystem.companies[0].metrics[0].current=0;const r=buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal,supporting,evidenceInput:{},manifest:m,catalog,legacy});has(r.issues,'FAILED_SCOPE_CHANGED');assert.equal(hash(ledger),before);});
test('unchecked source date cannot be advanced',()=>{const c=clone(d);c.sources.financial.checked_at=at;has(validateTransition(d,c,manifest('source_audit'),catalog),'UNREAD_DATE');});
test('partial scope cannot claim full success',()=>{const c=clone(d);c.last_successful_check_at=at;has(validateTransition(d,c,manifest('ecosystem'),catalog),'FALSE_FRESHNESS');});
test('new quarter needs a complete report bundle',()=>{const c=clone(d);c.financial_period='FY2026 Q4';has(validateTransition(d,c,manifest('micron'),catalog),'REPORT_BUNDLE');});
test('candidate replay is deterministic with a fixed run clock',()=>{const input={previousLedger:ledger,previousEvidence:evidence,proposal:d,supporting,evidenceInput:{},manifest:manifest('full'),catalog,legacy};assert.equal(stable(buildCandidate(input)),stable(buildCandidate(input)));});
test('concurrent base-data change invalidates an old plan',()=>{const m=manifest('full');m.base_sha256='b'.repeat(64);assert.throws(()=>buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal:d,supporting,evidenceInput:{},manifest:m,catalog,legacy}),/BASE_CHANGED/);});
test('unreviewed coverage cannot claim successful discovery',()=>{const m=manifest('ecosystem');m.coverage[0].status='verified';has(validateTransition(d,d,m,catalog),'DISCOVERY');});
test('source failures are explicit and do not parse error pages',async()=>{await assert.rejects(fetchSource('https://example.com/report',{fetcher:async()=>new Response('denied',{status:403})}),/HTTP 403/);});
test('untrusted local URLs are rejected before fetch',async()=>{let called=false;await assert.rejects(fetchSource('https://127.0.0.1/report',{fetcher:()=>{called=true;}}),/public HTTPS/);assert.equal(called,false);});
test('renderer never imports acquisition or publication code',()=>{const text=fs.readFileSync(new URL('../assets/monitor.js',import.meta.url),'utf8');assert(!/pipeline\/|capture|create_commit|fetchSource/.test(text));assert(!fs.readFileSync(new URL('../lib/monitor-core.js',import.meta.url),'utf8').includes('document.'));});

function quoteRun(){
  const m=manifest('quote'),proposal=clone(d),sid=d.quote.source_id,def=catalog.definitions['quote.mu'];proposal.quote.price+=1;
  const captured={source_id:sid,url:d.sources[sid].url,sha256:'a'.repeat(64),access:'full',accessed_at:at,reviewed_at:at,status:'read'};m.reads=[captured];
  m.coverage[0]={key:'quote',status:'verified',evidence:[sid],reviewed_at:at,latest_disclosure:{url:captured.url,published_at:d.quote.as_of},reason:''};
  const input={measurement:def.measurement,unit:def.unit,definition_version:def.version,temporal_basis:def.temporal_basis,accounting_basis:def.accounting_basis,scope:def.scope,
    values:{current:null,previous:null,value:null,summary:null},raw_inputs:['price','previous_close'].map(field=>({field,value:proposal.quote[field],scale:1,source_unit:'USD',period:proposal.quote.as_of,locator:field,source_id:sid})),
    review:{confirmed:true,method:'fixture review',at},documents:[{...captured,locator:'Regular close table',excerpt:'Synthetic test fixture, not live market data.'}]};
  return {previousLedger:ledger,previousEvidence:evidence,proposal,supporting,evidenceInput:{'quote.mu':input},manifest:m,catalog,legacy};
}
test('reviewed quote update follows the full candidate path without advancing financial checks',()=>{const r=buildCandidate(quoteRun());assert.deepEqual(r.issues,[]);assert.equal(r.document.quote.price,d.quote.price+1);assert.equal(r.document.last_successful_check_at,d.last_successful_check_at);assert.equal(r.document.quote.checked_at,at);assert.equal(r.receipt.state,'verified');});
test('raw input scaling mistakes block a candidate',()=>{const args=quoteRun();args.evidenceInput['quote.mu'].raw_inputs[0].scale=1000;has(buildCandidate(args).issues,'NORMALIZATION');});
test('an abstract capture cannot be promoted to full text',()=>{const args=quoteRun();args.manifest.reads[0].access='abstract';has(buildCandidate(args).issues,'UNCAPTURED_SOURCE');});
test('period-basis metadata is enforced on evidence',()=>{const args=quoteRun();args.evidenceInput['quote.mu'].temporal_basis='year_to_date';has(buildCandidate(args).issues,'SEMANTICS');});
test('source-only audit cannot silently update numeric facts',()=>{const args=quoteRun();args.manifest.scope='source_audit';has(buildCandidate(args).issues,'AUDIT_SCOPE');});

const evolution=()=>({oldCatalog:catalog,catalog:clone(catalog),oldLedger:ledger,ledger:clone(ledger),oldEvidence:evidence,evidence:clone(evidence),oldLegacy:legacy,legacy:clone(legacy)});
test('economic meaning cannot change without a definition version',()=>{const x=evolution();x.catalog.definitions['eco.microsoft.revenue'].scope='Different segment';has(validateEvolution(x),'DEFINITION_VERSION');});
test('retirement preserves historical metric identity',()=>{const x=evolution();delete x.catalog.definitions['eco.microsoft.revenue'];has(validateEvolution(x),'DEFINITION_HISTORY');});
test('legacy exemption cannot be expanded',()=>{const x=evolution();x.legacy.record_hashes.push('forged');has(validateEvolution(x),'LEGACY_IMMUTABLE');});
test('historical records cannot be removed',()=>{const x=evolution();delete x.ledger.records[Object.keys(x.ledger.records)[0]];has(validateEvolution(x),'RECORD_HISTORY');});
test('historical evidence cannot be overwritten',()=>{const x=evolution();x.evidence[Object.keys(x.evidence)[0]].location='changed';has(validateEvolution(x),'EVIDENCE_HISTORY');});
