import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {cycleSignals,cycleSignalRefs,spotPremiums,datedRatio}=createRequire(import.meta.url)('../lib/monitor-core.js');
const row=(id,current,extra={})=>({id,label:id,current,previous:null,unit:'USD',source_ids:['x'],evidence_type:'direct',...extra});
const doc=(metrics,series={})=>({metrics:metrics.map(([id,rows])=>({id,category:'industry',rows})),series});

test('the signal row lists only back-tested rows that exist, with their measured lead',()=>{
  const d=doc([['demand',[row('korea_semi_exports',60295,{unit:'USDm'}),row('korea_memory_exports',54070,{unit:'USDm'})]],['inventory',[row('days',129,{unit:'days'})]],['contract',[row('ddr4_spot',46.357)]]]);
  const signals=cycleSignals(d);
  assert.deepEqual(signals.map(s=>`${s.metric.id}.${s.row.id}`),['demand.korea_semi_exports','inventory.days']);
  assert(signals.every(s=>/回测/.test(s.lead)));
  assert.deepEqual(cycleSignals(doc([['inventory',[row('days',null,{evidence_type:'unavailable'})]]])),[]);
});
test('spot premium pairs same-spec rows and skips a missing contract price',()=>{
  const d=doc([['contract',[row('ddr4_spot',46.357,{as_of:'2026-10-20'}),row('ddr4_contract',25,{as_of:'2026-08'}),row('ddr5_spot',60.867)]]]);
  const [p,...rest]=spotPremiums(d);
  assert.equal(rest.length,0);
  assert.equal(p.label,'DDR4 8Gb');
  assert.equal(Math.round(p.premium*10)/10,85.4);
});
test('the inventory ratio divides matching readings and their shared past points',()=>{
  const pts=list=>list.map(([as_of,value])=>({as_of,value,unit:'index'}));
  const d=doc([['supply',[row('korea_ic_inventory',118.7,{unit:'index',as_of:'2026-08'}),row('korea_ic_shipment',138.2,{unit:'index',as_of:'2026-08'})]]],
    {'mu.supply.korea_ic_inventory':pts([['2026-06',97.6],['2026-07',120.1]]),'mu.supply.korea_ic_shipment':pts([['2026-07',117.8]])});
  const r=datedRatio(d,'supply','korea_ic_inventory','korea_ic_shipment');
  assert.equal(r.as_of,'2026-08');
  assert.equal(r.value.toFixed(4),(118.7/138.2).toFixed(4));
  assert.deepEqual(r.history.map(p=>p.as_of),['2026-07']);
  d.metrics[0].rows[1].as_of='2026-07';
  assert.equal(datedRatio(d,'supply','korea_ic_inventory','korea_ic_shipment'),null);
});
test('every signal-row entry passed the saved back-test at both peaks under both re-arm rules',()=>{
  const results=JSON.parse(fs.readFileSync(new URL('../research/cycle-backtest/results.json',import.meta.url)));
  const tested={'demand.korea_semi_exports':'korea_semi_exports','inventory.days':'mu_inventory_days'};
  for(const ref of cycleSignalRefs){
    const r=results.find(x=>x.id===tested[`${ref.metric}.${ref.row}`]);
    assert(r,`${ref.metric}.${ref.row} has no back-test result`);
    for(const rule of ['gm','fresh_gm'])for(const turn of ['2018 峰','2022 峰'])
      assert(r[rule].find(e=>e.turn===turn).lead_months>=3,`${r.id} ${rule} ${turn}`);
  }
});
