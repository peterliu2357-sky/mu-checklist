import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../../data/monitor.json',import.meta.url)));
const NOW='2026-11-20T12:00:00Z';
// The price card with three rows whose age is set per test; limits and checks are synthetic.
async function open(page,{rows,reviews=[],width=390}) {
  const d=structuredClone(data),card=d.metrics.find(m=>m.id==='contract');
  card.rows=card.rows.filter(r=>rows[r.id]);for(const r of card.rows)r.as_of=rows[r.id];
  d.monitoring.row_reviews=reviews;
  const status=await (await page.request.get('/data/update-status.json')).json();
  status.freshness={review_valid_days:6,page_grace_days:5,rows:Object.fromEntries(card.rows.map(r=>[`mu.contract.${r.id}`,10]))};
  await page.setViewportSize({width,height:900});
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/data/monitor.json?*',r=>r.fulfill({json:d}));
  await page.route('**/data/update-status.json?*',r=>r.fulfill({json:status}));
  await page.goto('/#contract');
  await expect(page.locator('#contract')).toBeVisible();
}
const row=(page,label)=>page.locator('#contract .evidence-row',{hasText:label});
const review=(id,finding,data_date)=>({metric_id:'mu.contract.'+id,finding,reviewed_at:'2026-11-19T01:00:00Z',data_date,source_ids:['spot'],note:''});

test('an industry card header gives the date range of its rows, not a stored label',async({page})=>{
  await open(page,{rows:{ddr4_spot:'2026-11-17',tlc_spot:'2026-11-16',ddr5_spot:'2026-11-19'}});
  await expect(page.locator('#contract .card-period')).toHaveText('各行资料日期 11-16 至 11-19');
  await expect(page.locator('#contract .card-period')).not.toContainText('09-23');
  await expect(page.locator('#contract .basis.stale')).toHaveCount(0);
});

for(const width of [320,390])test(`rows past their limit are marked at ${width}px`,async({page})=>{
  await open(page,{width,rows:{ddr4_spot:'2026-10-01',tlc_spot:'2026-10-02',ddr5_spot:'2026-10-03'},reviews:[review('tlc_spot','no_newer','2026-10-02'),review('ddr5_spot','newer_found','2026-10-03')]});
  await expect(row(page,'DDR4 1Gx8 3200 现货').locator('.basis.stale')).toHaveText('待更新');
  await expect(row(page,'DDR4 1Gx8 3200 现货').locator('.row-period')).toContainText('已超过预期更新周期');
  await expect(row(page,'512Gb TLC 现货').locator('.basis.stale')).toHaveCount(0);
  await expect(row(page,'512Gb TLC 现货').locator('.row-period')).toContainText('11-19 核查，来源暂无更新');
  await expect(row(page,'DDR5 16Gb').locator('.basis.stale')).toHaveText('新资料待录入');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a row only just past its limit is left to the next routine check before the page marks it',async({page})=>{
  await open(page,{rows:{ddr4_spot:'2026-11-07',tlc_spot:'2026-11-19',ddr5_spot:'2026-11-19'}});
  await expect(page.locator('#contract .basis.stale')).toHaveCount(0);
});

test('company cards keep their reporting-period header',async({page})=>{
  await open(page,{rows:{ddr4_spot:'2026-11-19',tlc_spot:'2026-11-19',ddr5_spot:'2026-11-19'}});
  await page.goto('/#revenue');
  await expect(page.locator('#revenue .card-period')).toHaveText(data.metrics.find(m=>m.id==='revenue').period);
});
