import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,materialize,activeRecords,recordHash} from '../pipeline/model.mjs';
import {validateLedger} from '../pipeline/validate.mjs';
import {createManifest,buildCandidate} from '../pipeline/run.mjs';
import {validateEvolution} from '../pipeline/evolution.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const ledger=read('data/ledger.json'),catalog=read('pipeline/catalog.json'),evidence=read('data/evidence.json'),legacy=read('pipeline/legacy-baseline.json');
const d=materialize(ledger),supporting=Object.fromEntries(Object.entries(ledger.supporting).map(([id,ref])=>[id,ledger.records[ref].payload]));
const at=new Date(Date.parse(d.updated_at)+86400000).toISOString();
const manifest=scope=>({...createManifest({scope,base_commit:'a'.repeat(40),document:d,catalog,at}),completed_at:at});
const has=(issues,code)=>assert(issues.some(x=>x.code===code),JSON.stringify(issues));
const tracked=catalog.series.metrics;
// The quarter before the live one, as already stored and evidenced in the ledger.
const earlier=metric=>Object.values(ledger.records).find(r=>r.metric_id===metric&&r.context.financial_period&&r.context.financial_period!==d.financial_period);
const run=(scope,history,extra={})=>buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal:clone(d),supporting,history,evidenceInput:{},manifest:manifest(scope),catalog,legacy,...extra});

test('a maintenance run can seed past quarters from records that already carry evidence',()=>{
  const history=Object.fromEntries(tracked.map(m=>[m,{[earlier(m).context.financial_period]:{record_id:earlier(m).id}}]));
  const r=run('maintenance',history);
  assert.deepEqual(r.issues,[]);
  for(const m of tracked){const points=r.document.series[m],seeded=points.find(p=>p.financial_period===earlier(m).context.financial_period);assert.equal(seeded.value,earlier(m).payload.current);assert(points.every(p=>p.financial_period!==d.financial_period));}
  assert.deepEqual(validateLedger(r.ledger,catalog,r.evidence,legacy),[]);
  assert.deepEqual(validateEvolution({oldCatalog:catalog,catalog,oldLedger:ledger,ledger:r.ledger,oldEvidence:evidence,evidence:r.evidence,oldLegacy:legacy,legacy}),[]);
});
test('series points cannot be removed once published',()=>{
  const m=tracked[0],r=run('maintenance',{[m]:{[earlier(m).context.financial_period]:{record_id:earlier(m).id}}}),next=clone(r.ledger);
  delete next.series[m];
  has(validateEvolution({oldCatalog:catalog,catalog,oldLedger:r.ledger,ledger:next,oldEvidence:r.evidence,evidence:r.evidence,oldLegacy:legacy,legacy}),'SERIES_HISTORY');
});
const point={period_end:'2024-08-29',sources:[{id:'mu_fy2025_q4',url:'https://example.com/fy2025-q4-release.pdf',published_at:'2025-09-23'}],payload:{label:'库存天数',current:158,previous:null,unit:'days',source_ids:['mu_fy2025_q4'],kind:'实际',period:'FQ4 期末',location:'Example locator',evidence_type:'direct',id:'days'}};
test('a new past-quarter point needs reviewed evidence from a source read in the run',()=>{
  has(run('micron',{'mu.inventory.days':{'FY2024 Q4':point}}).issues,'EVIDENCE_REQUIRED');
  const m=manifest('micron'),captured={source_id:'mu_fy2025_q4',url:point.sources[0].url,sha256:'a'.repeat(64),access:'full',accessed_at:at,reviewed_at:at,status:'read'};m.reads=[captured];
  const def=catalog.definitions['mu.inventory.days'];
  const input={measurement:def.measurement,unit:def.unit,definition_version:def.version,temporal_basis:def.temporal_basis,accounting_basis:def.accounting_basis,scope:def.scope,values:{current:158,previous:null,value:null,summary:null},
    raw_inputs:[{field:'current',value:158,scale:1,source_unit:'days',period:'FY2024 Q4',locator:'Example locator',source_id:'mu_fy2025_q4'}],review:{confirmed:true,method:'fixture review',at},documents:[{...captured,locator:'Example locator',excerpt:'Synthetic test fixture, not a real filing.'}]};
  const r=buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal:clone(d),supporting,history:{'mu.inventory.days':{'FY2024 Q4':point}},evidenceInput:{'mu.inventory.days@FY2024 Q4':input},manifest:m,catalog,legacy});
  assert.deepEqual(r.issues.filter(i=>i.path.includes('FY2024')||i.code.startsWith('SERIES')),[]);
  assert.equal(r.document.series['mu.inventory.days'].find(p=>p.financial_period==='FY2024 Q4').sources[0].url,point.sources[0].url);
  const wrong=clone(input);wrong.documents[0].url='https://example.com/other.pdf';
  has(buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal:clone(d),supporting,history:{'mu.inventory.days':{'FY2024 Q4':point}},evidenceInput:{'mu.inventory.days@FY2024 Q4':wrong},manifest:m,catalog,legacy}).issues,'UNCAPTURED_SOURCE');
});
test('the live quarter and untracked metrics cannot enter a series',()=>{
  const live=activeRecords(ledger).find(r=>r.metric_id==='mu.inventory.days');
  has(run('maintenance',{'mu.inventory.days':{[d.financial_period]:{record_id:live.id}}}).issues,'SERIES_PERIOD');
  has(run('maintenance',{'mu.asp.dram':{'FY2024 Q4':{record_id:live.id}}}).issues,'SERIES_METRIC');
  has(run('quote',{'mu.inventory.days':{'FY2024 Q4':point}}).issues,'SCOPE');
});
test('a quarter rollover keeps the outgoing quarter as a series point',()=>{
  const proposal=clone(d);proposal.financial_period='FY2027 Q1';proposal.financial_as_of='2026-11-26';
  const r=buildCandidate({previousLedger:ledger,previousEvidence:evidence,proposal,supporting,history:{},evidenceInput:{},manifest:manifest('micron'),catalog,legacy});
  for(const m of tracked)assert.equal(r.ledger.series[m][d.financial_period],activeRecords(ledger).find(x=>x.metric_id===m).id);
});

// Industry readings: the live row carries as_of and the reading it replaces becomes a dated point.
const DDR4='mu.contract.ddr4_spot';
function ledgerWithLiveDate(as_of){
  const l=clone(ledger),old=activeRecords(l).find(r=>r.metric_id===DDR4),r=clone(old);
  r.payload.as_of=as_of;r.id=recordHash(r);l.records[r.id]=r;
  const rows=l.document.metrics.find(m=>m.id==='contract').rows,i=rows.findIndex(x=>x.record_ref===old.id);rows[i]={record_ref:r.id};
  return {ledger:l,live:r};
}
const proposalWith=(base,change)=>{const p=materialize(base),row=p.metrics.find(m=>m.id==='contract').rows.find(x=>x.id==='ddr4_spot');Object.assign(row,change);return p;};
const industryRun=(base,proposal,extra={})=>{const m={...createManifest({scope:'industry',base_commit:'a'.repeat(40),document:materialize(base),catalog,at}),completed_at:at};return buildCandidate({previousLedger:base,previousEvidence:evidence,proposal,supporting,history:{},evidenceInput:{},manifest:m,catalog,legacy,...extra});};
const seriesIssues=issues=>issues.filter(i=>i.code.startsWith('SERIES')||i.code==='OBSERVATION_DATE');

test('a newer industry reading keeps the replaced one as a dated point',()=>{
  const {ledger:base,live}=ledgerWithLiveDate('2026-09-29');
  const r=industryRun(base,proposalWith(base,{current:46.5,as_of:'2026-10-06'}));
  assert.equal(r.ledger.series[DDR4]['2026-09-29'],live.id);
  assert.deepEqual(r.document.series[DDR4].map(p=>[p.as_of,p.value]),[['2026-09-29',live.payload.current]]);
  assert.deepEqual(seriesIssues(r.issues),[]);
});
test('a same-date correction replaces the live reading without adding a point',()=>{
  const {ledger:base}=ledgerWithLiveDate('2026-09-29');
  const r=industryRun(base,proposalWith(base,{current:46.4}));
  assert.equal(r.ledger.series?.[DDR4],undefined);
});
test('a new industry reading must say which date it describes',()=>{
  has(industryRun(ledger,proposalWith(ledger,{current:46.5})).issues,'OBSERVATION_DATE');
  has(industryRun(ledger,proposalWith(ledger,{current:46.5,as_of:'Oct 6'})).issues,'OBSERVATION_DATE');
});
test('a backfilled industry point needs evidence and must predate the live reading',()=>{
  const {ledger:base}=ledgerWithLiveDate('2026-09-29'),def=catalog.definitions[DDR4];
  const source={id:'tf_spot_0922',url:'https://example.com/spot-0923',published_at:'2026-09-23'};
  const payload=as_of=>({label:'DDR4 1Gx8 3200 现货',current:46.04,previous:null,unit:'USD',source_ids:[source.id],kind:'行业报价',note:'',period:'截至 09-22',as_of,change:null,location:'Example locator',evidence_type:'direct',id:'ddr4_spot'});
  const m={...createManifest({scope:'industry',base_commit:'a'.repeat(40),document:materialize(base),catalog,at}),completed_at:at};
  const captured={source_id:source.id,url:source.url,sha256:'b'.repeat(64),access:'full',accessed_at:at,reviewed_at:at,status:'read'};m.reads=[captured];
  const input={measurement:def.measurement,unit:def.unit,definition_version:def.version,temporal_basis:def.temporal_basis,accounting_basis:def.accounting_basis,scope:def.scope,values:{current:46.04,previous:null,value:null,summary:null},
    raw_inputs:[{field:'current',value:46.04,scale:1,source_unit:'USD',period:'2026-09-22',locator:'Example locator',source_id:source.id}],review:{confirmed:true,method:'fixture review',at},documents:[{...captured,locator:'Example locator',excerpt:'Synthetic test fixture, not a real report.'}]};
  const build=(key,evidenceInput)=>buildCandidate({previousLedger:base,previousEvidence:evidence,proposal:materialize(base),supporting,history:{[DDR4]:{[key]:{sources:[source],payload:payload(key)}}},evidenceInput,manifest:m,catalog,legacy});
  has(build('2026-09-22',{}).issues,'EVIDENCE_REQUIRED');
  const ok=build('2026-09-22',{[`${DDR4}@2026-09-22`]:input});
  // The fixture's dated live row reuses the old row's evidence, so only that binding is expected to fail.
  assert.deepEqual(ok.issues.filter(i=>i.code!=='EVIDENCE_BINDING'),[]);
  assert.equal(ok.document.series[DDR4][0].sources[0].url,source.url);
  has(build('2026-09-29',{[`${DDR4}@2026-09-29`]:input}).issues,'SERIES_PERIOD');
  has(build('2026-09',{[`${DDR4}@2026-09`]:input}).issues,'SERIES_PERIOD');
});
test('a new industry reading cannot go back in time or switch date format',()=>{
  const {ledger:base}=ledgerWithLiveDate('2026-09-29');
  has(industryRun(base,proposalWith(base,{current:46.5,as_of:'2026-09-22'})).issues,'OBSERVATION_DATE');
  has(industryRun(base,proposalWith(base,{current:46.5,as_of:'2026-10'})).issues,'OBSERVATION_DATE');
});
test('a published industry point cannot be replaced',()=>{
  const {ledger:base,live}=ledgerWithLiveDate('2026-09-29'),first=industryRun(base,proposalWith(base,{current:46.5,as_of:'2026-10-06'})),next=clone(first.ledger);
  next.series[DDR4]['2026-09-29']=activeRecords(first.ledger).find(r=>r.metric_id===DDR4).id;
  has(validateEvolution({oldCatalog:catalog,catalog,oldLedger:first.ledger,ledger:next,oldEvidence:first.evidence,evidence:first.evidence,oldLegacy:legacy,legacy}),'SERIES_HISTORY');
  assert.equal(first.ledger.series[DDR4]['2026-09-29'],live.id);
});
