import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../../data/monitor.json',import.meta.url)));
for(const width of [320,390,860])test(`cycle tab signals and sections at ${width}px`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:900});
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:data}));
  await page.goto('/#cycle');
  await expect(page.locator('#panel-industry')).toBeVisible();
  await expect(page.locator('.nav [data-panel="industry"]')).toHaveText('周期');
  await expect(page.locator('.cycle-signal')).toHaveCount(8);
  for(const id of ['price','supply','demand'])await expect(page.locator(`#cycle-${id}`)).toBeAttached();
  await expect(page.locator('#cycle-demand .group-total')).toContainText('本页计算');
  await expect(page.locator('#panel-ecosystem .group-total')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#supply')).not.toContainText('美光对 DRAM');
  await expect(page.locator('#company-outlook')).toContainText('美光对 DRAM');
  await page.locator('.cycle-signal[data-metric="inventory"]').click();
  await expect(page.locator('#panel-business')).toBeVisible();
  await expect(page.locator('#inventory')).toBeInViewport();
  await page.locator('.nav [data-panel="overview"]').click();
  await page.locator('#panel-overview [data-panel-link="industry"]').click();
  await expect(page.locator('#panel-industry')).toBeVisible();
  expect(errors).toEqual([]);
});
test('signal cards draw past quarters plus the live quarter as a trend line',async({page})=>{
  const d=structuredClone(data),days=d.metrics.find(m=>m.id==='inventory').rows.find(r=>r.id==='days');
  // Synthetic past quarters for layout only.
  d.series={'mu.inventory.days':[['FY2026 Q2','2026-02-26',118],['FY2026 Q3','2026-05-28',120]].map(([financial_period,period_end,value])=>({financial_period,period_end,value,unit:'days',sources:[{id:'x',url:'https://example.com/',published_at:period_end}],record_id:'a'.repeat(64)}))};
  await page.setViewportSize({width:390,height:900});
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:d}));
  await page.goto('/#cycle');
  const card=page.locator('.cycle-signal[data-metric="inventory"]');
  await expect(card.locator('.sparkline circle.dot')).toHaveCount(3);
  await expect(card.locator('.sparkline svg')).toHaveAttribute('aria-label',`FY2026 Q2 118天；FY2026 Q3 120天；${d.financial_period} ${days.current}天`);
  await expect(page.locator('.cycle-signal[data-metric="margin"] .sparkline')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
