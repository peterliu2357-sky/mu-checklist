/* Public evidence monitor. All observations live in data/monitor.json. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value, digits = 2) => Number(value).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  function valuation(price, eps, pes, retentions) {
    if (![price, eps, ...pes, ...retentions].every(x => Number.isFinite(x) && x > 0)) return null;
    const annual = eps * 4;
    return {annual, required: pes.map(pe => ({pe, eps:price / pe, retention:price / pe / annual})), rows:retentions.map(retention => ({retention, eps:annual * retention, cells:pes.map(pe => {const value = annual * retention * pe;return {pe,value,margin:(value-price)/value};})}))};
  }
  function freshness(data, now = Date.now()) {
    const warnings = [];
    const last = Date.parse(data.last_successful_check_at);
    if (!Number.isFinite(last) || now - last > 36 * 3600000) warnings.push('超过 36 小时未完成核查。以下为最近成功保存的资料，请先确认数据时效。');
    if (data.expected_report_review_by && now > Date.parse(data.expected_report_review_by)) warnings.push('财报复核期限已到，当前财报快照可能已过期。请查看更新记录。');
    if (now - Date.parse(data.quote.as_of) > 4 * 86400000) warnings.push('收盘价已超过 4 天未更新，估值测算仍使用标注日期的价格。');
    if (data.check_log?.[0]?.status === 'failed') warnings.push('最近一次核查未成功；保留上次成功数据。');
    return warnings;
  }
  function rowChange(row) {
    if (row.change) return row.change;
    if (typeof row.current !== 'number' || typeof row.previous !== 'number') return '';
    const delta = row.current - row.previous;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    if (row.unit === 'pct') return `${sign}${num(Math.abs(delta), 1)} 个百分点`;
    if (row.previous === 0) return '';
    return `${sign}${num(Math.abs(delta / row.previous) * 100, 1)}%`;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {valuation, freshness, rowChange};
  if (typeof document === 'undefined') return;
  let data;
  let active = 'overview';
  const labels = {support:'支持',mixed:'证据分化',watch:'需关注',unknown:'待核实'};
  const sourceLabels = {financial:'美光财报',business:'业务单元表',q3:'FQ3 10-Q',q2:'FQ2 10-Q',deck:'业绩演示',earnings:'美光财报',quarter_remarks:'管理层说明',orders:'长单说明',q3_orders:'10-Q 合同披露',hbm_product:'HBM 产品进度',hbm_secondary:'份额转引报道',supply:'TrendForce 供需',dram:'DRAM 合同价',contract:'NAND 合同价',spot:'现货周报',ssd:'企业 SSD 报告',mobile:'手机内存报告摘要',price:'历史收盘价',next:'财报活动页'};
  function date(value, detailed = false) {
    if (!value) return '未标注';
    if (!value.includes('T')) return value;
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return value;
    return dt.toLocaleString('zh-CN', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',...(detailed ? {hour:'2-digit',minute:'2-digit',hour12:false} : {})}).replace(/\//g,'-') + (detailed ? ' ET' : '');
  }
  function checkDate(value, detailed = false) {
    if (!value) return '未标注';
    const stamp = new Date(value);
    if (!Number.isFinite(stamp.getTime())) return value;
    return stamp.toISOString().slice(0,detailed?16:10).replace('T',' ') + ' UTC';
  }
  function sourceLink(id, long = false) {
    const s = data.sources[id];
    if (!s || !/^https:\/\//.test(s.url)) return '';
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.label)}">${esc(long ? s.label : (sourceLabels[id] || s.label))} ↗</a>`;
  }
  function value(value, unit) {
    if (value === null || value === undefined) return '<span class="current text-value muted">未取得可核实数据</span>';
    if (typeof value !== 'number') return `<span class="current text-value">${esc(value)}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</span>`;
    const units = {USDm:'亿美元',pct:'%',USD:'美元',days:'天',multiple:'倍'};
    let display = unit === 'USDm' ? num(value/100) : unit === 'pct' ? num(value,1) : unit === 'days' || unit === '份' ? num(value,0) : num(value,unit === 'USD' && Math.abs(value*100-Math.round(value*100)) > 0.00001 ? 3 : 2);
    return `<span class="current">${display}<span class="unit">${esc(units[unit] || unit)}</span></span>`;
  }
  function previous(value, unit) {
    if (typeof value !== 'number') return esc(value);
    return unit === 'USDm' ? num(value/100) : unit === 'pct' ? num(value,1) : unit === 'days' || unit === '份' ? num(value,0) : num(value,2);
  }
  function evidence(row) {
    const forecast = /预测|计划/.test(row.kind), missing = row.kind === '缺失';
    const change = rowChange(row);
    return `<div class="evidence-row"><div class="row-top"><span class="row-label">${esc(row.label)}</span><span class="kind ${forecast?'forecast':missing?'missing':''}">${esc(row.kind)}</span></div><div class="numbers">${row.previous !== null && row.previous !== undefined ? `<span class="previous">${previous(row.previous,row.unit)}</span><span class="arrow" aria-label="变为">→</span>` : ''}${value(row.current,row.unit)}${change ? `<span class="delta">${esc(change)}</span>`:''}</div><p class="row-period">${esc(row.period)}</p>${row.note?`<p class="row-note">${esc(row.note)}</p>`:''}<div class="source-links">${row.source_ids.map(id=>sourceLink(id)).join('')}</div></div>`;
  }
  function metricCard(metric, index) {
    return `<article class="card metric" id="${esc(metric.id)}"><div class="metric-top"><div class="metric-heading"><span class="metric-title"><span class="metric-number">${String(index+1).padStart(2,'0')}</span>${esc(metric.title)}</span><span class="status ${esc(metric.status)}">${labels[metric.status]||'待核实'}</span></div><h3 class="headline">${esc(metric.headline)}</h3><p class="micro">${esc(metric.period)}</p><p class="judgment-label">我的判断</p><p class="judgment">${esc(metric.judgment)}</p></div>${metric.rows.slice(0,2).map(evidence).join('')}<details class="evidence-details"><summary>全部 ${metric.rows.length} 项证据与复核条件</summary>${metric.rows.slice(2).map(evidence).join('')}<div class="review"><h4>还不能证明什么</h4><ul>${metric.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><div class="trigger"><h4>什么会改变我的判断</h4><p>${esc(metric.trigger)}</p><p class="now">现在：${esc(metric.trigger_status)}</p></div><p class="micro" style="margin-top:12px">核查 ${esc(metric.checked_at)} UTC · 下次重点复核 ${esc(metric.next_review)}</p></div></details></article>`;
  }
  function signal(id, name, big, text, wide = false) {
    return `<a class="card signal ${wide?'wide':''}" href="#${id}" data-metric="${id}"><span class="metric-name">${esc(name)}</span><span class="big">${esc(big)}</span><span class="blurb">${esc(text)}</span><span class="open">查看判断与依据 →</span></a>`;
  }
  function overviewCards(cards) {
    return cards.map((card,index)=>{
      const metric=data.metrics.find(m=>m.id===card.metric_id);
      const row=metric?.rows.find(r=>r.label===card.row_label);
      let stat=card.value || '待核实';
      if(card.stat==='required_eps') stat=`$${num(data.quote.price/card.pe)}`;
      else if(card.stat==='change' && row) stat=rowChange(row);
      else if(card.stat==='current' && row) stat=typeof row.current==='number' ? (row.unit==='USDm'?`${num(row.current/100)} 亿`:row.unit==='pct'?`${num(row.current,1)}%`:num(row.current)) : String(row.current??'待核实');
      return signal(card.metric_id,card.label,stat,card.text,index===2);
    }).join('');
  }
  function overview() {
    const q = data.quote;
    return `<section class="card hero"><div class="overline"><span class="dot"></span>我的判断 · 基于已核实资料</div><h2>${esc(data.overview.title)}</h2><p>${esc(data.overview.judgment)}</p><div class="market-strip"><div><div class="caption">MU 最近收盘</div><div class="price">$${num(q.price)}</div><div class="micro">${date(q.as_of)} · 常规交易</div><div class="source-links">${sourceLink(q.source_id)}</div></div><div><div class="caption">下一次关键验证</div><strong>${date(data.next_earnings_at).slice(5)}</strong><div class="micro">${esc(data.events[0]?.title || '财报更新')}<br>${date(data.next_earnings_at,true).split(' ').slice(1).join(' ')}</div><div class="source-links">${sourceLink(data.events[0]?.source_id)}</div></div></div></section><div class="section-heading"><h2>哪些事实支持判断</h2><span class="small">${esc(data.financial_period)} 实际</span></div><div class="evidence-grid">${overviewCards(data.overview.support_cards)}</div><div class="section-heading"><h2>现在最需要盯住</h2></div><div class="evidence-grid">${overviewCards(data.overview.watch_cards)}</div><div class="section-heading"><h2>下一次财报要验证</h2><span class="small">公司指引 ≠ 实际</span></div>${data.events.map(event=>`<div class="card event"><div class="date">${esc(event.date)}</div><h3>${esc(event.title)}</h3><p>${esc(event.watch)}</p><div class="source-links">${sourceLink(event.source_id)}</div></div>`).join('')}<div class="section-heading"><h2>仍缺少的关键证据</h2></div><ul class="gap-list">${data.overview.gaps.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p class="section-intro">缺失项保持未证实，不用其他指标代替。行业预测与公司披露有分歧时，在对应指标里并列展示。</p>`;
  }
  function valuationPanel() {
    const m = data.metrics.find(x=>x.id === 'valuation');
    return `${metricCard(m,data.metrics.indexOf(m))}<section class="card valuation-box"><div class="overline">情景测算 · 非目标价</div><h3>当前价格要求多高的盈利？</h3><p>用股价除以假设的年度市盈率，反推市场价格所需的年度每股盈利。倍数是测算假设，不代表已经证明合理。</p><div class="inputs"><label for="price-input">股价 · 美元<input id="price-input" aria-label="情景股价" type="number" inputmode="decimal" min="0.01" step="0.01" value="${data.quote.price}"></label><label for="eps-input">单季 EPS · 美元<input id="eps-input" aria-label="情景单季 EPS" type="number" inputmode="decimal" min="0.01" step="0.01" value="${data.valuation.quarter_eps}"></label></div><button class="button" id="reset-valuation">恢复已核实数据</button><p class="valuation-note" id="scenario-caption">默认采用 ${date(data.quote.as_of)} 收盘与 ${esc(data.valuation.eps_period)} 非 GAAP EPS。修改只影响此处测算。</p><div id="scenario-error" class="form-error" role="status"></div><div id="valuation-results" aria-live="polite"></div></section>`;
  }
  function paintValuation() {
    const price = Number(document.getElementById('price-input').value);
    const eps = Number(document.getElementById('eps-input').value);
    const result = valuation(price,eps,data.valuation.pe_assumptions,data.valuation.retention_assumptions);
    const error = document.getElementById('scenario-error');
    const target = document.getElementById('valuation-results');
    if (!result) {error.textContent='请输入大于 0 的股价与 EPS。亏损情景不适用这个 PE 模型。';target.innerHTML='';return;}
    error.textContent='';
    const customized = price !== data.quote.price || eps !== data.valuation.quarter_eps;
    document.getElementById('scenario-caption').textContent = customized ? '正在查看自定义假设；已核实股价与财报数据未改变。' : `默认采用 ${date(data.quote.as_of)} 收盘与 ${data.valuation.eps_period} 非 GAAP EPS。修改只影响此处测算。`;
    target.innerHTML=`<div class="reverse">${result.required.map(r=>`<div><span>假设 ${r.pe} 倍 PE</span><strong>$${num(r.eps)}</strong><small>所需年度 EPS</small></div>`).join('')}</div><p>参考：${customized?'输入':'已公布'}单季 EPS × 4 = <strong>$${num(result.annual)}</strong>。这是年化参照，不是未来盈利预测。</p><h4 style="margin-top:23px">若只保留部分年化盈利</h4><div class="matrix-wrap"><table class="matrix"><caption class="sr-only">盈利保留比例与市盈率敏感性测算，金额为每股美元</caption><thead><tr><th scope="col">保留比例<br>年度 EPS</th>${data.valuation.pe_assumptions.map(pe=>`<th scope="col">${pe} 倍 PE</th>`).join('')}</tr></thead><tbody>${result.rows.map(r=>`<tr class="${r.retention===1?'reference':''}"><th scope="row">${num(r.retention*100,0)}%<span class="sub">$${num(r.eps)}</span></th>${r.cells.map(c=>`<td><strong>$${num(c.value,0)}</strong><span class="sub">${c.margin>=0?'余量':'超出'} ${num(Math.abs(c.margin)*100,1)}%</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="valuation-note">表内价格 = 假设年度 EPS × 假设 PE。“余量” =（情景价值 − 股价）÷ 情景价值；为负时显示“超出”。它衡量相对该假设的价格空间，不等于未来涨跌幅。</p><p class="valuation-note">若盈利进一步下降或进入亏损，这张表未覆盖的下行情景仍可能发生。</p>`;
  }
  function updates() {
    return `<section class="card update-status"><div class="line"><span>最近成功核查</span><strong>${checkDate(data.last_successful_check_at,true)}</strong></div><div class="line"><span>财报覆盖期间</span><strong>${esc(data.financial_period)}<br><span>截至 ${esc(data.financial_as_of)}</span></strong></div><div class="line"><span>收盘价日期</span><strong>${date(data.quote.as_of)}</strong></div><div class="line"><span>持续核查</span><strong>${data.automation.enabled?'每日核查已启用':'尚未启用'}</strong></div><p>${esc(data.automation.note)} 核查日不等于原始数据发布日期。超过 36 小时未完成核查，页面会提示时效风险。核查时间用 UTC；交易与财报活动用美国东部时间（ET）。原报告日期按来源标注。</p><button class="button" id="refresh-data" style="margin-top:14px">载入最新记录</button><p id="refresh-state" role="status"></p></section><div class="section-heading"><h2>这次改变了什么</h2></div><ol class="timeline">${data.changes.map(c=>`<li><time>${esc(c.date)}</time><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>核查记录</h2></div><ol class="timeline">${data.check_log.slice(0,7).map(c=>`<li><time>${checkDate(c.at,true)} · ${c.status==='success'?'核查完成':c.status==='failed'?'核查未完成':'部分完成'}</time><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>数据来源</h2><span class="small">点开原始资料</span></div><div class="source-directory">${Object.entries(data.sources).map(([id,s])=>`<div class="source-entry">${sourceLink(id,true)}<p>${esc(s.type)} · 发布 ${esc(s.published_at || '资料页，未标注日期')} · 核查 ${esc(s.checked_at)} UTC</p></div>`).join('')}</div><div class="section-heading"><h2>口径说明</h2></div><ul class="method">${data.methodology.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`;
  }
  function show(panel, updateHash = true) {
    if (!['overview','business','industry','valuation','updates'].includes(panel)) panel='overview';
    active=panel;
    document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==`panel-${panel}`);
    document.querySelectorAll('.nav button').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.panel===panel)));
    if(updateHash) history.replaceState(null,'',`#${panel}`);
  }
  function navigateHash(scroll = true) {
    const key = location.hash.slice(1);
    const m = data.metrics.find(x=>x.id===key);
    show(m?m.category:key,false);
    if(scroll && m) document.getElementById(m.id)?.scrollIntoView({behavior:'instant',block:'start'});
  }
  function render(fallback = false) {
    document.getElementById('checked-stamp').textContent=`核查 ${checkDate(data.last_successful_check_at)} · 财报 ${data.financial_period}`;
    const warnings = freshness(data);
    if(fallback) warnings.unshift(`未能载入最新记录，正显示 ${checkDate(data.updated_at,true)} 保存的备用快照。`);
    document.getElementById('freshness').innerHTML=warnings.map(w=>`<div class="banner" role="status">${esc(w)}</div>`).join('');
    document.getElementById('panel-overview').innerHTML=overview();
    for(const category of ['business','industry']) document.getElementById(`panel-${category}`).innerHTML=`<h2>${category==='business'?'经营数据与判断':'行业变化与交叉验证'}</h2><p class="section-intro">${category==='business'?'先读判断，再对照实际值与上期值。金额为亿美元；FQ 为美光财季。':'价格、供需与终端需求分开核实。自然季度、公司财季和预测不混算。'}</p>${data.metrics.map((m,i)=>m.category===category?metricCard(m,i):'').join('')}`;
    document.getElementById('panel-valuation').innerHTML=valuationPanel();
    document.getElementById('panel-updates').innerHTML=updates();
    paintValuation();
    document.getElementById('price-input').addEventListener('input',paintValuation);
    document.getElementById('eps-input').addEventListener('input',paintValuation);
    document.getElementById('reset-valuation').addEventListener('click',()=>{document.getElementById('price-input').value=data.quote.price;document.getElementById('eps-input').value=data.valuation.quarter_eps;paintValuation();});
    document.getElementById('refresh-data').addEventListener('click',()=>load(true));
    navigateHash(false);
    document.getElementById('loading').hidden=true;
  }
  async function load(refresh = false) {
    const feedback = document.getElementById('refresh-state');
    if(refresh && feedback) feedback.textContent='正在载入已发布的最新记录…';
    try {
      const response=await fetch(`data/monitor.json?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const next=await response.json();
      if(next.schema_version!==1 || !Array.isArray(next.metrics) || next.metrics.length<1 || !next.quote?.price) throw new Error('Invalid data');
      data=next;render();
      if(refresh) document.getElementById('refresh-state').textContent=`已载入。最新核查：${checkDate(data.last_successful_check_at,true)}。此按钮不触发新一轮研究。`;
    } catch(error) {
      if(!data) {data=JSON.parse(document.getElementById('fallback-data').textContent);render(true);}
      else {document.getElementById('freshness').innerHTML=`<div class="banner" role="alert">最新记录载入失败。保留 ${checkDate(data.updated_at,true)} 的已载入资料。</div>`;if(feedback)feedback.textContent='载入失败，请稍后重试。';}
    }
  }
  document.querySelectorAll('.nav button').forEach(btn=>btn.addEventListener('click',()=>{show(btn.dataset.panel);window.scrollTo({top:0,behavior:'instant'});}));
  document.addEventListener('click',event=>{const link=event.target.closest('[data-metric]');if(!link)return;event.preventDefault();const id=link.dataset.metric;history.replaceState(null,'',`#${id}`);navigateHash();});
  window.addEventListener('hashchange',()=>navigateHash());
  load().then(()=>navigateHash());
})();
