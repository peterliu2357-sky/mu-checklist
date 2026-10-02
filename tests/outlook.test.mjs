import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,materialize} from '../pipeline/model.mjs';
import {validateOutlook,stampOutlook,outlookContext} from '../pipeline/outlook.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const d=materialize(read('data/ledger.json')),catalog=read('pipeline/catalog.json'),outlook=read('data/outlook.json');
const has=(issues,code)=>assert(issues.some(x=>x.code===code),JSON.stringify(issues));
const withPoint=(text,refs)=>{const o=clone(outlook);o.sections[0].points.push({text,refs});return o;};

test('the published analysis cites only facts on the site, with current values',()=>{
  assert.deepEqual(validateOutlook(outlook,d),[]);
  const cited=new Set(outlookContext(d,catalog).map(r=>r.ref));
  for(const ref of Object.keys(outlook.cited))assert(cited.has(ref),ref);
});
test('numbers in prose are rejected; they must come from cited tokens',()=>{
  has(validateOutlook(stampOutlook(withPoint('收入增长 30%。',['mu.revenue.total']),d,d.updated_at),d),'OUTLOOK_NUMBER');
  has(validateOutlook(stampOutlook(withPoint('库存约 129 天。',['mu.inventory.days']),d,d.updated_at),d),'OUTLOOK_NUMBER');
  assert.deepEqual(validateOutlook(stampOutlook(withPoint('FY2026 Q4 库存 {{mu.inventory.days}}，HBM4 与 DDR5 进展见 2026 年报。',['mu.inventory.days']),d,d.updated_at),d),[]);
});
test('every claim cites a published metric, and tokens must be listed as citations',()=>{
  has(validateOutlook(stampOutlook(withPoint('需求很强。',[]),d,d.updated_at),d),'OUTLOOK_CITATION');
  has(validateOutlook(stampOutlook(withPoint('收入 {{mu.revenue.total}}。',['mu.margin.nongaap']),d,d.updated_at),d),'OUTLOOK_CITATION');
  has(validateOutlook(stampOutlook(withPoint('外部数据。',['mu.revenue.made_up']),d,d.updated_at),d),'OUTLOOK_REFERENCE');
  has(validateOutlook(stampOutlook(withPoint('过去。',['series.mu.revenue.total@FY2019 Q1']),d,d.updated_at),d),'OUTLOOK_REFERENCE');
});
test('a changed cited value or a new quarter makes the analysis stale until it is rewritten',()=>{
  const next=clone(d);next.metrics.find(m=>m.id==='inventory').rows.find(r=>r.id==='days').current=140;
  has(validateOutlook(outlook,next),'OUTLOOK_STALE');
  const rolled=clone(d);rolled.financial_period='FY2027 Q1';
  has(validateOutlook(outlook,rolled),'OUTLOOK_STALE');
  const unrelated=clone(d);unrelated.quote.price+=1;
  assert.deepEqual(validateOutlook(outlook,unrelated),[]);
});
test('stance is limited and trading language is rejected',()=>{
  has(validateOutlook({...outlook,stance:'buy'},d),'OUTLOOK_STANCE');
  has(validateOutlook(stampOutlook(withPoint('建议买入。',['mu.revenue.total']),d,d.updated_at),d),'OUTLOOK_ADVICE');
});
