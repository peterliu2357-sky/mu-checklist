import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,materialize,activeRecords} from '../pipeline/model.mjs';
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
