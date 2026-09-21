import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/baseline.json',import.meta.url)));
for(const width of [320,390,430])test(`all panels remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/data/monitor.json?*',route=>route.fulfill({json:fixture}));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.fact-card')).toHaveCount(8);
  await expect(page.locator('.guidance-row')).toHaveCount(3);
  for(const panel of ['overview','business','industry','ecosystem','updates']){
    await page.locator(`.nav [data-panel="${panel}"]`).click();
    await expect(page.locator(`#panel-${panel}`)).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.goto('/#partner-nvidia');await expect(page.locator('#partner-nvidia')).toBeVisible();
  await page.locator('#partner-nvidia .partner-outlook summary').click();
  await expect(page.locator('#partner-nvidia .partner-outlook-item').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const urls=await page.locator('.source-links a').evaluateAll(nodes=>nodes.map(n=>n.href));expect(urls.every(u=>u.startsWith('https://'))).toBe(true);expect(errors).toEqual([]);
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
