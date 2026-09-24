import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from '../pipeline/model.mjs';
import {buildUpdateStatus} from '../scripts/update-status.mjs';
import times from '../lib/update-times.js';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url)));
const published=read('../data/monitor.json');
const schedule=read('../config/update-schedule.json');
const clone=value=>structuredClone(value);

test('the last data update is a changed, verified release, not the document write time or an unchanged check',()=>{
  const before=clone(published);before.revision='test-before';before.updated_at='2026-09-21T21:00:00Z';
  const changed=clone(before);changed.revision='test-changed';changed.updated_at='2026-09-21T22:10:00Z';changed.quote.price+=1;changed.quote.checked_at='2026-09-21T22:05:00Z';
  const checked=clone(changed);checked.revision='test-checked';checked.updated_at='2026-09-22T22:10:00Z';checked.quote.checked_at='2026-09-22T22:05:00Z';
  const release=(old,next,at,status)=>({artifact_sha256:hash(next),base_sha256:hash(old),base_revision:old.revision,completed_at:at,scope:'quote',result:'success',state:'verified',coverage:[{key:'quote',status,reviewed_at:at}]});
  const status=buildUpdateStatus(checked,[before,changed],[release(before,changed,'2026-09-21T22:10:00Z','verified'),release(changed,checked,'2026-09-22T22:10:00Z','unchanged')],schedule);
  assert.equal(status.last_data_update_at,'2026-09-21T22:10:00Z');
  assert.deepEqual(status.last_data_keys,['quote']);
  assert.equal(status.checks.quote.last_checked_at,'2026-09-22T22:10:00Z');
});

test('scheduled times cross daylight saving correctly and skip known market holidays',()=>{
  const research=schedule.research;
  assert.equal(times.occurrences(research,Date.parse('2026-09-23T18:00:00Z')).next_at,'2026-09-24T00:00:00.000Z');
  assert.equal(times.occurrences(research,Date.parse('2026-11-01T12:00:00Z')).next_at,'2026-11-02T01:00:00.000Z');
  assert.equal(times.occurrences({...schedule.quote,starts_at:'2026-09-01T00:00:00Z'},Date.parse('2026-09-07T12:00:00Z'),true).next_at,'2026-09-08T22:10:00.000Z');
});

test('a source reviewed early on the scheduled day has no false missed-run alert',()=>{
  const d=clone(published);d.monitoring={version:1,policy:{},checks:[],calendar:[]};d.quote.as_of='2026-09-23T16:00:00-04:00';
  const s={version:1,data_revision:d.revision,last_data_update_at:'2026-09-23T23:54:02Z',checks:{quote:{last_checked_at:'2026-09-23T22:00:00Z'},industry:{last_checked_at:'2026-09-23T23:52:00Z'},news:{last_checked_at:'2026-09-23T23:47:00Z'}},schedule:{...schedule,earnings:{enabled:false,events:[]}}};
  const v=times.view(d,s,Date.parse('2026-09-24T05:00:00Z'));
  assert.equal(v.available,true);
  assert.equal(v.rows.find(x=>x.key==='news').warning,'');
  assert.equal(v.rows.find(x=>x.key==='industry').warning,'');
  assert.equal(v.next.at,'2026-09-24T22:10:00.000Z');
  assert.equal(times.view({...d,revision:'other'},s).available,false);
});

test('invalid or missing timestamps cannot become an apparently successful update',()=>{
  const d=clone(published);const s={version:1,data_revision:d.revision,last_data_update_at:d.updated_at,checks:{},schedule};
  assert.equal(times.view(d,{...s,last_data_update_at:'yesterday'}).available,false);
  assert.equal(times.view(d,null).last_at,null);
});
