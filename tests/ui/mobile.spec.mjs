import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/baseline.json',import.meta.url)));
const newsFixture=JSON.parse(fs.readFileSync(new URL('../fixtures/news.json',import.meta.url)));
const withNews=()=>({...structuredClone(fixture),...structuredClone(newsFixture),sources:{...fixture.sources,...newsFixture.sources}});
for(const width of [320,390,430])test(`all panels remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:withNews()}));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.fact-card')).toHaveCount(8);
  await expect(page.locator('.guidance-row')).toHaveCount(3);
  for(const panel of ['overview','business','industry','ecosystem','news','updates']){
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
test('news filters, evidence and historical deep links work on a phone',async({page})=>{
  await page.setViewportSize({width:320,height:844});
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:withNews()}));
  await page.goto('/#news');
  await expect(page.locator('#news-list .news-card')).toHaveCount(2);
  await expect(page.locator('#news-memory_example')).toContainText('16.00');
  await expect(page.locator('#news-memory_example .source-links a').last()).toHaveAttribute('href','https://example.com/original-disclosure');
  await page.locator('#news-category').selectOption('products');
  await expect(page.locator('#news-list .news-card')).toHaveCount(1);
  await expect(page.locator('#news-product_example')).toContainText('公司计划');
  await page.locator('#news-product_example summary').click();
  await expect(page.locator('#news-product_example details')).toContainText('原文产品计划段落');
  await page.locator('#news-company').selectOption('micron');
  await expect(page.locator('#news-list .empty')).toBeVisible();
  await page.locator('#news-category').selectOption('all');
  await expect(page.locator('#news-list .news-card')).toHaveCount(1);
  await page.goto('/#news-archived_example');
  await expect(page.locator('#news-archived_example')).toBeVisible();
  await expect(page.locator('#news-archived_example time')).toHaveText('2026-07-01');
  await expect(page.locator('#news-days')).toHaveValue('all');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('a pending company appears only in its section and old financial checks do not expire',async({page})=>{
  const data=withNews();data.monitoring={version:1,policy:{financial_discovery_days:7},calendar:[],checks:[{key:'company:nvidia',status:'failed',finding:'unchanged',checked_at:'2026-09-20',attempted_at:'2026-09-22',source_ids:[]},{key:'company:micron',status:'unchanged',finding:'unchanged',checked_at:'2026-09-20',attempted_at:'2026-09-20',source_ids:[]}]};
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
  const data=withNews();data.news.items=null;
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:data}));
  await page.goto('/#news');await expect(page.locator('#freshness')).toContainText('备用资料');
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
