import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import freshness from '../lib/freshness-core.js';
import {updatePlan,deriveRowReviews,validateRowFreshness,validateInterpretations} from '../pipeline/updates.mjs';
import {validateDocument,validateTransition} from '../pipeline/validate.mjs';
import {materialize,clone} from '../pipeline/model.mjs';
import {buildUpdateStatus} from '../scripts/update-status.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const catalog=read('pipeline/catalog.json'),live=materialize(read('data/ledger.json')),base=read('tests/fixtures/baseline.json');
const at=iso=>Date.parse(iso);

// One industry card with a daily price row dated 2026-11-01 and a limit of 10 days.
const SPOT='mu.contract.ddr4_spot';
const config=(rows={[SPOT]:10})=>({...clone(catalog),freshness:{review_valid_days:6,page_grace_days:5,rows}});
function doc(as_of='2026-11-01') {
  const d=clone(base);d.monitoring={version:1,policy:catalog.monitoring.policy,checks:[],calendar:[]};
  const card=d.metrics.find(m=>m.id==='contract');card.rows=card.rows.filter(r=>r.id==='ddr4_spot');card.rows[0].as_of=as_of;
  d.metrics=d.metrics.filter(m=>m.category!=='industry'||m.id==='contract');
  return d;
}
const read_=(id,at)=>({source_id:id,status:'read',reviewed_at:at,sha256:'a'.repeat(64)});
const run=(scope,completed_at,extra={})=>({scope,completed_at,coverage:[{key:'industry',status:'unchanged'}],reads:[read_('spot',completed_at)],...extra});
const review=(finding,reviewed_at,data_date='2026-11-01')=>({metric_id:SPOT,finding,reviewed_at,data_date,source_ids:['spot'],note:''});
const state=(d,now,c=config())=>freshness.report(d,c.freshness,at(now))[0].state;
const codes=issues=>issues.map(i=>i.code);

test('a reading is dated by its as_of, a month by its last day, otherwise by its newest source',()=>{
  const sources={a:{published_at:'2026-07-30'},b:{published_at:'2026-09-30'},c:{published_at:null}};
  assert.equal(freshness.dataDate({as_of:'2026-11-03',source_ids:['b']},sources),'2026-11-03');
  assert.equal(freshness.dataDate({as_of:'2026-09',source_ids:['b']},sources),'2026-09-30');
  assert.equal(freshness.dataDate({as_of:'2028-02',source_ids:[]},sources),'2028-02-29');
  assert.equal(freshness.dataDate({source_ids:['a','b','c']},sources),'2026-09-30');
  assert.equal(freshness.dataDate({source_ids:['c']},sources),null);
});

test('a row is fresh through its limit and overdue the day after',()=>{
  const d=doc();
  assert.equal(state(d,'2026-11-11T23:59:00Z'),'fresh');
  assert.equal(state(d,'2026-11-12T00:00:00Z'),'overdue');
});

test('a check that found nothing newer covers the row for the review window only',()=>{
  const d=doc();d.monitoring.row_reviews=[review('no_newer','2026-11-15T01:00:00Z')];
  assert.equal(state(d,'2026-11-18T01:00:00Z'),'confirmed');
  assert.equal(state(d,'2026-11-21T01:00:00Z'),'overdue');
  assert.equal(freshness.report(d,config().freshness,at('2026-11-24T01:00:00Z'))[0].overdue_days,3);
});

test('a check made for an older reading does not cover the current one',()=>{
  const d=doc();d.monitoring.row_reviews=[review('no_newer','2026-11-15T01:00:00Z','2026-10-20')];
  assert.equal(state(d,'2026-11-16T00:00:00Z'),'overdue');
});

test('newer data found but not entered stays pending however old the check',()=>{
  const d=doc();d.monitoring.row_reviews=[review('newer_found','2026-11-15T01:00:00Z')];
  assert.equal(state(d,'2026-11-16T00:00:00Z'),'pending');
  assert.equal(state(d,'2026-12-30T00:00:00Z'),'pending');
});

test('rows without a reading are not tracked',()=>{
  const d=doc();d.metrics.find(m=>m.id==='contract').rows[0].evidence_type='unavailable';
  assert.deepEqual(freshness.report(d,config().freshness,at('2027-01-01T00:00:00Z')),[]);
});

test('every reading on an industry card must have a limit',()=>{
  const c=clone(catalog);delete c.freshness.rows[SPOT];
  assert(validateDocument(live,c).some(i=>i.code==='FRESHNESS_RULE'&&i.path===SPOT));
  assert(!codes(validateDocument(live,catalog)).includes('FRESHNESS_RULE'));
});

test('a company-card reading older than the current report must have a limit',()=>{
  const d=clone(live),row=d.metrics.find(m=>m.id==='revenue').rows.find(r=>r.id==='total');
  d.sources[row.source_ids[0]]={...d.sources[row.source_ids[0]],published_at:'2020-01-01'};
  const hit=validateDocument(d,catalog).filter(i=>i.code==='FRESHNESS_RULE').map(i=>i.path);
  assert(hit.includes('mu.revenue.total'));
});

test('a limit for an unknown or retired metric is rejected',()=>{
  const c=clone(catalog);c.freshness.rows['mu.contract.typo']=10;
  assert(validateDocument(live,c).some(i=>i.code==='FRESHNESS_RULE'&&i.path==='mu.contract.typo'));
});

test('a discovery run that covered industry cannot publish over an overdue row',()=>{
  const d=doc(),c=config(),issues=validateRowFreshness(d,d,run('discovery','2026-11-15T01:00:00Z'),c);
  assert.deepEqual(codes(issues),['ROW_FRESHNESS']);assert.equal(issues[0].path,SPOT);
});

test('recording a check of the row lets the discovery run publish',()=>{
  const d=doc(),c=config();
  for(const finding of ['no_newer','newer_found']){
    const r=run('discovery','2026-11-15T01:00:00Z',{row_reviews:[{metric_id:SPOT,finding,source_ids:['spot'],note:''}]}),next=clone(d);
    deriveRowReviews(d,next,r,c);
    assert.deepEqual(next.monitoring.row_reviews,[review(finding,'2026-11-15T01:00:00Z')]);
    assert.deepEqual(validateRowFreshness(d,next,r,c),[]);
  }
});

test('newer data found in an earlier run blocks later runs until the row is updated',()=>{
  const d=doc(),c=config();d.monitoring.row_reviews=[review('newer_found','2026-11-15T01:00:00Z')];
  assert.deepEqual(codes(validateRowFreshness(d,d,run('discovery','2026-11-19T01:00:00Z'),c)),['ROW_FRESHNESS']);
  assert.deepEqual(codes(validateRowFreshness(d,d,run('industry','2026-11-15T03:00:00Z'),c)),['ROW_FRESHNESS']);
  const updated=doc('2026-11-14');deriveRowReviews(d,updated,run('industry','2026-11-15T03:00:00Z'),c);
  assert.equal(updated.monitoring.row_reviews,undefined);
  assert.deepEqual(validateRowFreshness(d,updated,run('industry','2026-11-15T03:00:00Z'),c),[]);
});

test('an industry run cannot leave a row merely marked as having newer data',()=>{
  const d=doc(),c=config(),r=run('industry','2026-11-15T01:00:00Z',{row_reviews:[{metric_id:SPOT,finding:'newer_found',source_ids:['spot'],note:''}]}),next=clone(d);
  deriveRowReviews(d,next,r,c);
  assert.deepEqual(codes(validateRowFreshness(d,next,r,c)),['ROW_FRESHNESS']);
});

test('a row check needs a source read in the same run and completed industry coverage',()=>{
  const d=doc(),c=config(),entry={metric_id:SPOT,finding:'no_newer',source_ids:['spot'],note:''};
  const unread=run('discovery','2026-11-15T01:00:00Z',{row_reviews:[entry],reads:[]}),a=clone(d);deriveRowReviews(d,a,unread,c);
  assert(codes(validateRowFreshness(d,a,unread,c)).includes('ROW_REVIEW'));
  const failed={...run('discovery','2026-11-15T01:00:00Z',{row_reviews:[entry]}),coverage:[{key:'industry',status:'failed'}]},b=clone(d);deriveRowReviews(d,b,failed,c);
  assert(codes(validateRowFreshness(d,b,failed,c)).includes('ROW_REVIEW'));
});

test('row checks cannot be written into the data by hand',()=>{
  const d=doc(),c=config(),next=clone(d);next.monitoring.row_reviews=[review('no_newer','2026-11-15T01:00:00Z')];
  assert(codes(validateRowFreshness(d,next,run('discovery','2026-11-15T01:00:00Z'),c)).includes('ROW_REVIEW'));
});

test('runs that did not cover industry are not held to row freshness',()=>{
  const d=doc(),c=config(),quote={scope:'quote',completed_at:'2026-12-30T01:00:00Z',coverage:[{key:'quote',status:'verified'}],reads:[]};
  assert.deepEqual(validateRowFreshness(d,d,quote,c),[]);
  const failed={...run('discovery','2026-12-30T01:00:00Z'),coverage:[{key:'industry',status:'failed'}]};
  assert.deepEqual(validateRowFreshness(d,d,failed,c),[]);
});

test('the release gate replays row freshness from the receipt',()=>{
  const d=doc(),c=config(),next=clone(d);next.revision+='-next';
  const r={...run('discovery','2026-11-15T01:00:00Z'),coverage:[{key:'industry',status:'unchanged',evidence:['spot'],reviewed_at:'2026-11-15T01:00:00Z',latest_disclosure:{url:'https://example.com/',published_at:'2026-11-11'}}],targets:['industry']};
  assert(codes(validateTransition(d,next,r,c)).includes('ROW_FRESHNESS'));
});

test('changed rows with untouched card prose are rejected until rewritten or re-read',()=>{
  const d=doc(),next=doc('2026-11-14');
  assert.deepEqual(codes(validateInterpretations(d,next,{})),['INTERPRETATION_STALE']);
  assert.deepEqual(validateInterpretations(d,next,{interpretation_reviewed:['contract']}),[]);
  const rewritten=clone(next);rewritten.metrics.find(m=>m.id==='contract').interpretation+=' 更新。';
  assert.deepEqual(validateInterpretations(d,rewritten,{}),[]);
  assert.deepEqual(validateInterpretations(d,d,{}),[]);
});

test('the routine plan lists rows that need an update or a check',()=>{
  const d=doc(),c=config();
  assert.deepEqual(updatePlan(d,c,{mode:'midweek',now:'2026-11-08T00:00:00Z'}).row_reviews,[]);
  const due=updatePlan(d,c,{mode:'weekly',now:'2026-11-15T00:00:00Z'}).row_reviews;
  assert.deepEqual(due.map(r=>[r.metric_id,r.state,r.data_date,r.age_days,r.limit_days]),[[SPOT,'overdue','2026-11-01',14,10]]);
  assert.deepEqual(updatePlan(d,c,{mode:'earnings',now:'2026-11-15T00:00:00Z'}).row_reviews,[]);
});

test('a card header spans the dates of its readings',()=>{
  const sources={a:{published_at:'2026-09-30'}};
  assert.deepEqual(freshness.span({rows:[{as_of:'2026-11-11',source_ids:['a']},{source_ids:['a']},{evidence_type:'unavailable',as_of:'2020-01-01'}]},sources),{from:'2026-09-30',to:'2026-11-11'});
});

test('the page receives the freshness limits with the update status',()=>{
  const status=buildUpdateStatus(live,[],[],read('config/update-schedule.json'),catalog.freshness);
  assert.deepEqual(status.freshness,{review_valid_days:catalog.freshness.review_valid_days,page_grace_days:catalog.freshness.page_grace_days,rows:catalog.freshness.rows});
});
