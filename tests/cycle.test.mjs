import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {cycleSignals,cycleSignalRefs,spotPremiums,datedRatio,makerLines,wordedTrend,cycleLayout}=createRequire(import.meta.url)('../lib/monitor-core.js');
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

test('the three makers are listed side by side from rows stored elsewhere, each on its own comparison basis',()=>{
  const point=(financial_period,value)=>({financial_period,period_end:'2025-08-28',value,unit:'USDm'});
  const d={financial_period:'FY2026 Q4',series:{'mu.capex.net':[point('FY2025 Q4',4000),point('FY2026 Q3',7000)]},
    metrics:[{id:'capex',category:'business',rows:[row('net',10000,{label:'净资本开支',previous:7000,unit:'USDm'})]},{id:'inventory',category:'business',rows:[row('total',10000,{label:'总库存',previous:8000,unit:'USDm'})]},
      {id:'peers',category:'industry',rows:[row('skhynix_dram_asp','合成表述',{unit:''})]}],
    ecosystem:{companies:[{id:'samsung',name:'三星 Samsung',period:'2026 Q3',metrics:[row('capex',27,{label:'集团现金资本开支',previous:10,unit:'KRWt'})]},{id:'skhynix',name:'SK 海力士',period:'2026 Q3',metrics:[row('capex',12,{label:'集团现金资本开支',previous:5,unit:'KRWt'}),row('inventory',19,{label:'集团期末存货',previous:13,unit:'KRWt'})]}]}};
  const lines=makerLines(d),find=(group,id)=>lines.find(l=>l.group===group&&l.id===id);
  // Micron's year-ago capex comes from the series point of the same quarter, not the row's prior quarter.
  assert.deepEqual([find('capex','micron').previous,find('capex','micron').basis,find('capex','micron').change],[4000,'同比','+150.0%']);
  assert.deepEqual([find('inventory','micron').basis,find('inventory','micron').change],['环比','+25.0%']);
  assert.deepEqual([find('capex','samsung').href,find('capex','samsung').basis],['#partner-samsung','同比']);
  assert.equal(find('inventory','samsung'),undefined);
  assert.deepEqual([find('capex','skhynix').href,find('capex','skhynix').change,find('inventory','skhynix').basis],['#partner-skhynix','+140.0%','同比']);
  assert.deepEqual(cycleLayout(d).find(s=>s.id==='supply').metrics.map(m=>m.id),['peers']);
  // A stored change on a peer row is shown as stored, as on its partner card.
  d.ecosystem.companies[0].metrics[0].change='+149%（报告值）';assert.equal(makerLines(d).find(l=>l.group==='capex'&&l.id==='samsung').change,'+149%（报告值）');
  // Without the year-ago series point Micron's capex is listed without a change rather than against the wrong quarter.
  delete d.series;assert.equal(makerLines(d).find(l=>l.group==='capex'&&l.id==='micron').change,'');
});
test('worded history lists past quarters then the live wording, and stays empty for numeric rows',()=>{
  const d={financial_period:'FY2026 Q4',series:{'mu.asp.dram':[{financial_period:'FY2026 Q2',value:'甲'},{financial_period:'FY2026 Q3',value:'乙'}],'mu.inventory.days':[{financial_period:'FY2026 Q3',value:120}]}};
  assert.deepEqual(wordedTrend(d,{id:'asp'},{id:'dram',current:'丙'}),[{period:'FY2026 Q2',value:'甲'},{period:'FY2026 Q3',value:'乙'},{period:'FY2026 Q4',value:'丙'}]);
  assert.deepEqual(wordedTrend(d,{id:'asp'},{id:'dram',current:'丙'},2).map(p=>p.value),['乙','丙']);
  assert.deepEqual(wordedTrend(d,{id:'inventory'},{id:'days',current:129}),[]);
  assert.deepEqual(wordedTrend(d,{id:'asp'},{id:'nand',current:'丙'}),[]);
});
