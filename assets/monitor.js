/* Facts first. Data, provenance and short interpretations are kept separate. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value,digits=2) => Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const provenance={direct:'直接披露',calculated:'本页计算',proxy:'间接指标',secondary:'媒体转引',unavailable:'未取得'};
  function rowChange(row) {
    if(row.change) return row.change;
    if(typeof row.current!=='number'||typeof row.previous!=='number') return '';
    const change=row.current-row.previous,sign=change>0?'+':change<0?'−':'';
    if(row.unit==='pct') return `${sign}${num(Math.abs(change),1)} 个百分点`;
    if(row.previous===0) return '';
    return `${sign}${num(Math.abs(change/row.previous)*100,1)}%`;
  }
  function guidanceActuals(row, dataset) {
    return (row.actuals||[]).map(ref=>{
      const source=dataset.metrics.find(m=>m.id===ref.metric_id)?.rows.find(r=>r.label===ref.row_label);
      return {...ref,value:source?.[ref.field],unit:source?.unit,source_ids:source?.source_ids||[]};
    });
  }
  function guidanceComparison(row,dataset) {
    const actuals=guidanceActuals(row,dataset),latest=actuals[actuals.length-1];
    if(!latest||!Number.isFinite(latest.value)||latest.value===0||!Number.isFinite(row.current)) return null;
    const difference=row.unit==='pct'?row.current-latest.value:(row.current/latest.value-1)*100;
    return {period:latest.period,value:difference,unit:row.unit==='pct'?'个百分点':'%'};
  }
  function freshness(data,now=Date.now()) {
    const warnings=[],last=Date.parse(data.last_successful_check_at);
    if(!Number.isFinite(last)||now-last>36*3600000) warnings.push('超过 36 小时未完成数据核查。当前显示最近保存的资料，请留意每项日期。');
    if(data.expected_report_review_by&&now>Date.parse(data.expected_report_review_by)) warnings.push('财报复核期限已到，当前财报数据可能已过期。');
    if(now-Date.parse(data.quote.as_of)>4*86400000) warnings.push('收盘价已超过 4 天未更新，仍为标注日期的价格。');
    if(data.check_log?.[0]?.status==='failed') warnings.push('最近一次核查未成功；保留上次数据。');
    return warnings;
  }
  function validate(data) {
    if(data?.schema_version!==2||!Array.isArray(data.metrics)||!data.metrics.length||!data.sources||!data.overview?.fact_cards) return false;
    const ids=new Set();
    for(const m of data.metrics) {
      if(ids.has(m.id)||!['business','industry'].includes(m.category)||!Array.isArray(m.rows)||!m.rows.length) return false;
      ids.add(m.id);
      for(const r of m.rows) if(!provenance[r.evidence_type]||!r.location||!Array.isArray(r.source_ids)||r.source_ids.some(s=>!data.sources[s])) return false;
    }
    if(!Array.isArray(data.guidance)||!data.guidance.every(g=>
      Number.isFinite(g.current)&&g.source_ids?.every(id=>data.sources[id])&&
      (g.tolerance==null||(Number.isFinite(g.tolerance)&&g.tolerance>=0))&&
      g.actuals?.length===2&&guidanceActuals(g,data).every(a=>Number.isFinite(a.value)&&a.unit===g.unit)
    )) return false;
    return data.overview.fact_cards.every(c=>data.metrics.find(m=>m.id===c.metric_id)?.rows.some(r=>r.label===c.row_label));
  }
  if(typeof module!=='undefined'&&module.exports) module.exports={rowChange,freshness,validate,guidanceActuals,guidanceComparison};
  if(typeof document==='undefined') return;
  let data;
  function date(value,detailed=false) {
    if(!value) return '未标注';
    if(!value.includes('T')) return value;
    const dt=new Date(value);
    if(!Number.isFinite(dt.getTime())) return value;
    return dt.toLocaleString('zh-CN',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',...(detailed?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).replace(/\//g,'-')+(detailed?' ET':'');
  }
  function checkDate(value,detailed=false) {
    if(!value) return '未标注';
    const dt=new Date(value);
    if(!Number.isFinite(dt.getTime())) return value;
    return dt.toISOString().slice(0,detailed?16:10).replace('T',' ')+' UTC';
  }
  function sourceLink(id,long=false) {
    const s=data.sources[id];
    if(!s||!/^https:\/\//.test(s.url)) return '';
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.locator||s.label)}">${esc(long?s.label:(s.short_label||s.label))} ↗</a>`;
  }
  function formatted(value,unit) {
    if(typeof value!=='number') return esc(value??'未取得可核实数据');
    const digits=unit==='pct'?1:unit==='days'||unit==='份'?0:unit==='USD'&&Math.abs(value*100-Math.round(value*100))>0.00001?3:2;
    return num(unit==='USDm'?value/100:value,digits);
  }
  function unitName(unit) {return {USDm:'亿美元',pct:'%',USD:'美元',days:'天',multiple:'倍'}[unit]||unit;}
  function numberLine(row,compact=false) {
    const previous=row.previous!==null&&row.previous!==undefined;
    const current=row.current!==null&&row.current!==undefined;
    return `<div class="numbers ${compact?'compact-numbers':''}">${previous?`<span class="previous">${formatted(row.previous,row.unit)}</span><span class="arrow" aria-label="变为">→</span>`:''}<span class="current ${typeof row.current!=='number'?'text-value':''}">${formatted(row.current,row.unit)}${current&&row.unit?`<span class="unit">${esc(unitName(row.unit))}</span>`:''}</span></div>${rowChange(row)?`<div class="change-line">${esc(rowChange(row))}</div>`:''}`;
  }
  function tags(row) {
    const kind=/预测|指引|计划/.test(row.kind)?'forecast':row.evidence_type==='unavailable'?'missing':'';
    return `<span class="kind ${kind}">${esc(row.kind)}</span><span class="basis ${esc(row.evidence_type)}">${provenance[row.evidence_type]}</span>`;
  }
  function evidence(row) {
    return `<div class="evidence-row"><div class="row-top"><span class="row-label">${esc(row.label)}</span><span class="tag-group">${tags(row)}</span></div>${numberLine(row)}<p class="row-period">${esc(row.period)}</p>${row.note?`<p class="row-note">${esc(row.note)}</p>`:''}<div class="source-links">${row.source_ids.map(id=>sourceLink(id)).join('')}</div><p class="source-location">定位：${esc(row.location)}</p></div>`;
  }
  function metricCard(metric,index) {
    return `<article class="card metric" id="${esc(metric.id)}"><div class="metric-top"><div class="metric-heading"><h3><span class="metric-number">${String(index+1).padStart(2,'0')}</span>${esc(metric.title)}</h3></div><p class="micro">${esc(metric.period)}</p><p class="definition">${esc(metric.definition)}</p></div>${metric.rows.slice(0,2).map(evidence).join('')}<details class="evidence-details"><summary>${metric.rows.length>2?`展开其余 ${metric.rows.length-2} 项数据与口径`:'查看口径说明'}</summary>${metric.rows.slice(2).map(evidence).join('')}<div class="review"><h4>口径与缺失数据</h4><ul>${metric.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p class="micro">引用审校 ${esc(metric.checked_at)} UTC · 下次更新 ${esc(metric.next_review)}</p></div></details><div class="interpretation"><h4>简要解读</h4><p>${esc(metric.interpretation)}</p>${metric.interpretation_sources?.length?`<div class="source-links">${metric.interpretation_sources.map(id=>sourceLink(id)).join('')}</div>`:''}</div></article>`;
  }
  function factCard(card) {
    const metric=data.metrics.find(m=>m.id===card.metric_id),row=metric.rows.find(r=>r.label===card.row_label);
    return `<article class="card fact-card"><div class="fact-label">${esc(row.label)}</div>${numberLine(row,true)}<p class="row-period">${esc(row.period)}</p><div class="tag-group">${tags(row)}</div><div class="source-links">${row.source_ids.map(id=>sourceLink(id)).join('')}</div><a class="detail-link" href="#${esc(metric.id)}" data-metric="${esc(metric.id)}">更多数据与解读 →</a></article>`;
  }
  function guidanceRow(row) {
    const actuals=guidanceActuals(row,data),change=guidanceComparison(row,data);
    const quarter=period=>period.replace(/^FY\d+\s+F?Q/,'FQ');
    const compact=value=>(row.unit==='USDm'?value/100:value).toLocaleString('en-US',{maximumFractionDigits:2});
    const forecast=row.tolerance!=null?`${compact(row.current)} ± ${compact(row.tolerance)}`:`${row.approximate?'约 ':''}${formatted(row.current,row.unit)}`;
    const sources=[...new Set([...actuals.flatMap(a=>a.source_ids),...row.source_ids])];
    const changeText=change?`${row.approximate?'约 ':''}${change.value>=0?'+':'−'}${num(Math.abs(change.value),1)}${change.unit==='%'?'%':' 个百分点'}`:'';
    return `<article class="guidance-row"><div class="row-top"><h3>${esc(row.label)}<span class="unit">${esc(unitName(row.unit))}</span></h3><span class="micro">${esc(row.period.match(/^FY\d+/)?.[0]||'')}</span></div><dl class="quarter-comparison">${actuals.map(a=>`<div><dt>${esc(quarter(a.period))} 实际</dt><dd>${formatted(a.value,row.unit)}</dd></div>`).join('')}<div class="next-quarter"><dt>${esc(quarter(row.period))} 指引</dt><dd>${forecast}</dd></div></dl>${change?`<p class="guidance-change">较 ${esc(quarter(change.period))} 实际：<strong>${changeText}</strong>${row.tolerance!=null?' <span>（指引中值）</span>':''}</p>`:''}<div class="source-links">${sources.map(id=>sourceLink(id)).join('')}</div></article>`;
  }
  function overview() {
    return `<div class="data-heading"><h2>关键数据</h2><span>${esc(data.financial_period)}</span></div><p class="section-intro">财季截至 ${esc(data.financial_as_of)} · 发布 ${esc(data.financial_published_at)}</p><div class="fact-grid">${data.overview.fact_cards.map(factCard).join('')}</div><a class="all-data" href="#business" data-panel-link="business">查看全部公司数据 →</a><div class="section-heading"><h2>下一季公司指引</h2><span class="small">预测 · 尚未实现</span></div><section class="card guidance-card">${data.guidance.map(guidanceRow).join('')}</section><div class="section-heading"><h2>披露日程</h2></div>${data.events.map(e=>`<div class="card event"><div class="date">${esc(e.date)}</div><h3>${esc(e.title)}</h3><p>${date(data.next_earnings_at,true)}</p><div class="source-links">${sourceLink(e.source_id)}</div></div>`).join('')}<div class="section-heading"><h2>尚未取得的数据</h2></div><ul class="gap-list">${data.overview.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul><div class="quote-line"><span>MU 最近常规收盘</span><strong>$${num(data.quote.price)}</strong><span>${date(data.quote.as_of)}</span>${sourceLink(data.quote.source_id)}</div>`;
  }
  function updates() {
    return `<section class="card update-status"><div class="line"><span>最近完整数据核查</span><strong>${checkDate(data.last_successful_check_at,true)}</strong></div><div class="line"><span>最近引用审校</span><strong>${checkDate(data.last_source_audit_at,true)}</strong></div><div class="line"><span>财报覆盖期间</span><strong>${esc(data.financial_period)}<br><span>截至 ${esc(data.financial_as_of)}</span></strong></div><div class="line"><span>持续核查</span><strong>${data.automation.enabled?'每日核查已启用':'尚未启用'}</strong></div><p>${esc(data.automation.note)} 核查日不等于原始发布日期，引用审校也不等于行情更新。核查时间用 UTC；交易与活动时间用 ET。</p><button class="button" id="refresh-data" style="margin-top:14px">载入最新记录</button><p id="refresh-state" role="status"></p></section><div class="section-heading"><h2>证据标记</h2></div><div class="provenance-key"><p><b>直接披露</b>：来源明确给出这个指标。</p><p><b>本页计算</b>：由已列明输入及公式计算。</p><p><b>间接指标</b>：用于侧面观察另一变量，不能替代其直接数据。</p><p><b>媒体转引</b>：已核对转引报道，未读取原始表格。</p><p><b>未取得</b>：暂无可核实数值。</p><p>“直接披露”标明证据来源；是否为实际、估计或预测，以旁边的类型标签为准。</p></div><div class="section-heading"><h2>数据来源</h2></div><div class="source-directory">${Object.entries(data.sources).map(([id,s])=>`<div class="source-entry">${sourceLink(id,true)}<p>${esc(s.locator||'')}<br>${esc(s.type)} · 发布 ${esc(s.published_at||'未标注')} · 核查 ${esc(s.checked_at)} UTC</p></div>`).join('')}</div><div class="section-heading"><h2>修订记录</h2></div><ol class="timeline">${data.changes.slice(0,5).map(c=>`<li><time>${esc(c.date)}</time><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>核查记录</h2></div><ol class="timeline">${data.check_log.slice(0,7).map(c=>`<li><time>${checkDate(c.at,true)} · ${c.scope==='source_audit'?'引用审校':c.status==='success'?'数据核查完成':c.status==='failed'?'核查失败':'部分完成'}</time><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>口径说明</h2></div><ul class="method">${data.methodology.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`;
  }
  function show(panel,updateHash=true) {
    if(!['overview','business','industry','updates'].includes(panel)) panel='overview';
    document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==`panel-${panel}`);
    document.querySelectorAll('.nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));
    if(updateHash) history.replaceState(null,'',`#${panel}`);
  }
  function navigateHash(scroll=true) {
    const key=location.hash.slice(1),metric=data.metrics.find(m=>m.id===(key==='valuation'?'revenue':key));
    show(metric?metric.category:key,false);
    if(scroll&&metric) document.getElementById(metric.id)?.scrollIntoView({behavior:'instant',block:'start'});
  }
  function render(fallback=false) {
    document.getElementById('checked-stamp').textContent=`核查 ${checkDate(data.last_successful_check_at)} · ${data.financial_period}`;
    const warnings=freshness(data);
    if(fallback) warnings.unshift(`未能载入最新记录，显示 ${checkDate(data.updated_at,true)} 保存的备用资料。`);
    document.getElementById('freshness').innerHTML=warnings.map(w=>`<div class="banner" role="status">${esc(w)}</div>`).join('');
    document.getElementById('panel-overview').innerHTML=overview();
    for(const category of ['business','industry']) document.getElementById(`panel-${category}`).innerHTML=`<h2>${category==='business'?'公司数据':'行业数据'}</h2><p class="section-intro">${category==='business'?'财务金额为亿美元；FQ 为美光财季。各项附来源和原文位置。':'行业估计、报价与预测分别标识；用于观察终端消耗的间接指标单独说明。'}</p>${data.metrics.map((m,i)=>m.category===category?metricCard(m,i):'').join('')}`;
    document.getElementById('panel-updates').innerHTML=updates();
    document.getElementById('refresh-data').addEventListener('click',()=>load(true));
    navigateHash(false);document.getElementById('loading').hidden=true;
  }
  async function load(refresh=false) {
    const feedback=document.getElementById('refresh-state');
    if(refresh&&feedback) feedback.textContent='正在载入已发布的记录…';
    try {
      const response=await fetch(`data/monitor.json?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const next=await response.json();
      if(!validate(next)) throw new Error('Invalid data');
      data=next;render();
      if(refresh) document.getElementById('refresh-state').textContent=`已载入。完整核查：${checkDate(data.last_successful_check_at,true)}。此按钮不触发新一轮研究。`;
    } catch(error) {
      if(!data) {data=JSON.parse(document.getElementById('fallback-data').textContent);render(true);}
      else {document.getElementById('freshness').innerHTML=`<div class="banner" role="alert">最新记录载入失败，保留 ${checkDate(data.updated_at,true)} 的资料。</div>`;if(feedback)feedback.textContent='载入失败，请稍后重试。';}
    }
  }
  document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.panel);window.scrollTo({top:0,behavior:'instant'});}));
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-metric],[data-panel-link]');if(!link)return;
    event.preventDefault();history.replaceState(null,'',`#${link.dataset.metric||link.dataset.panelLink}`);navigateHash();
    if(link.dataset.panelLink) window.scrollTo({top:0,behavior:'instant'});
  });
  window.addEventListener('hashchange',()=>navigateHash());
  load().then(()=>navigateHash());
})();
