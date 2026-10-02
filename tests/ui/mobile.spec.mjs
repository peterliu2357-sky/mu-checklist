import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/baseline.json',import.meta.url)));
const updateSchedule=JSON.parse(fs.readFileSync(new URL('../../config/update-schedule.json',import.meta.url)));
const base=()=>structuredClone(fixture);
for(const width of [320,390,430])test(`all panels remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:base()}));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.fact-card')).toHaveCount(8);
  await expect(page.locator('.guidance-row')).toHaveCount(3);
  for(const panel of ['overview','business','industry','ecosystem','updates']){
    await page.locator(panel==='updates'?'footer [data-panel-link="updates"]':`.nav [data-panel="${panel}"]`).click();
    await expect(page.locator(`#panel-${panel}`)).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.goto('/#partner-nvidia');await expect(page.locator('#partner-nvidia')).toBeVisible();
  await page.locator('#partner-nvidia .partner-outlook summary').click();
  await expect(page.locator('#partner-nvidia .partner-outlook-item').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const urls=await page.locator('.source-links a').evaluateAll(nodes=>nodes.map(n=>n.href));expect(urls.every(u=>u.startsWith('https://'))).toBe(true);expect(errors).toEqual([]);
});
test('old AI 动态 links land on the overview',async({page})=>{
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:base()}));
  for(const hash of ['#news','#news-mu_rdimm_20260915']){
    await page.goto('/'+hash);await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#panel-overview')).toBeVisible();
  }
  await expect(page.locator('.nav [data-panel="news"]')).toHaveCount(0);
  await expect(page.locator('#panel-news')).toHaveCount(0);
});
test('a pending company appears only in its section and old financial checks do not expire',async({page})=>{
  const data=base();data.monitoring={version:1,policy:{financial_discovery_days:7},calendar:[],checks:[{key:'company:nvidia',status:'failed',finding:'unchanged',checked_at:'2026-09-20',attempted_at:'2026-09-22',source_ids:[]},{key:'company:micron',status:'unchanged',finding:'unchanged',checked_at:'2026-09-20',attempted_at:'2026-09-20',source_ids:[]}]};
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:data}));
  await page.goto('/#business');
  await expect(page.locator('#freshness')).toBeEmpty();
  await expect(page.locator('#panel-business .section-warning')).toHaveCount(0);
  await page.locator('.nav [data-panel="ecosystem"]').click();
  await expect(page.locator('#panel-ecosystem .section-warning')).toHaveCount(1);
  await expect(page.locator('#panel-ecosystem .section-warning')).toContainText('NVIDIA');
});
test('malformed news cannot crash loading instead of using dated fallback',async({page})=>{
  const data=base();data.news={categories:{},entities:{},fact_records:{},items:null};
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:data}));
  await page.goto('/');await expect(page.locator('#freshness')).toContainText('备用资料');
  await expect(page.locator('#loading')).toBeHidden();
});
test('network failure shows dated fallback and usable facts',async({page})=>{
  await page.route('**/data/monitor.json?*',r=>r.abort());await page.goto('/');
  await expect(page.locator('#freshness')).toContainText('备用资料');await expect(page.locator('.fact-card')).toHaveCount(8);
});
test('refresh loads published JSON and never contacts financial sources',async({page})=>{
  const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());});
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:fixture}));await page.goto('/#updates');await page.locator('#refresh-data').click();
  await expect(page.locator('#refresh-state')).toContainText('已载入');expect(external).toEqual([]);
});
for(const width of [320,390,430])test(`header update schedule expands without overflow at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.clock.setFixedTime(new Date('2026-09-24T12:00:00Z'));
  const d=base(),schedule={...updateSchedule,earnings:{enabled:false,events:[]}};
  const status={version:1,data_revision:d.revision,last_data_update_at:'2026-09-21T17:02:00Z',checks:{quote:{last_checked_at:'2026-09-21T17:01:00Z'},industry:{last_checked_at:'2026-09-23T23:52:00Z'},news:{last_checked_at:'2026-09-23T23:47:00Z'},'company:micron':{last_checked_at:'2026-09-20'}},schedule};
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:d}));
  await page.route('**/data/update-status.json?*',r=>r.fulfill({json:status}));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#last-data-update')).toContainText('09/21 10:02 PT');
  await expect(page.locator('#update-details-body')).toBeHidden();
  await page.locator('#update-details > summary').click();
  await expect(page.locator('.update-next')).toContainText('2026-09-24 15:10');
  await expect(page.locator('[data-update-key="news"]')).toHaveCount(0);
  await page.locator('.update-companies > summary').click();
  await expect(page.locator('.update-companies li')).toHaveCount(d.ecosystem.companies.length+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('a mismatched update receipt never labels the current facts as newly updated',async({page})=>{
  const d=base();
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:d}));
  await page.route('**/data/update-status.json?*',r=>r.fulfill({json:{version:1,data_revision:'other',last_data_update_at:d.updated_at,schedule:updateSchedule,checks:{}}}));
  await page.goto('/');
  await expect(page.locator('#last-data-update')).toHaveText('时间待确认');
  await page.locator('#update-details > summary').click();
  await expect(page.locator('#update-details-body')).toContainText('更新时间记录暂不可用');
  await expect(page.locator('.fact-card')).toHaveCount(8);
});
test('a released report waiting for entry is not listed as upcoming',async({page})=>{
  const d=base();d.monitoring={version:1,policy:{},checks:[],calendar:[{id:'mu_next',company_id:'micron',title:'美光下一季财报',period:'FY2026 Q4',scheduled_at:'2026-09-30T16:30:00-04:00',review_after:'2026-10-01T20:30:00Z',confirmation:'confirmed',source_ids:[d.quote.source_id],location:'x',kind:'公司日程',evidence_type:'direct'}]};
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:d}));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.event-pending')).toContainText('已发布 · 本页待录入');
  await page.locator('.calendar-details summary').click();
  await expect(page.locator('.calendar-company').first()).toContainText('已于 2026-09-30 发布，待录入');
});
