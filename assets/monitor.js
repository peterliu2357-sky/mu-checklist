/* Facts first. Data, provenance and short interpretations are kept separate. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const {rowChange,freshness,isRenderable:validate,guidanceActuals,guidanceComparison,partnerValue,partnerChange,provenance,partnerUnits}=globalThis.MonitorCore;
  const num = (value,digits=2) => Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const updateCore=globalThis.MonitorUpdates;
  const updateTimes=globalThis.MonitorUpdateTimes;
  const technology=globalThis.TechnologyUI;
  let data,updateStatus,savedData=false,updatePanelState,ecosystemGroup='cloud',newsCategory='all',newsCompany='all',newsDays=30;
  function updateTime(value,short=false){return value?`<time datetime="${esc(value)}">${esc(updateTimes.format(value,short))}</time>`:'暂无记录';}
  function renderUpdatePanel(){
    if(!data)return;
    const v=updateTimes.view(data,updateStatus),signature=JSON.stringify([v,savedData]);
    if(signature===updatePanelState)return;updatePanelState=signature;
    document.getElementById('last-data-update').innerHTML=v.last_at?updateTime(v.last_at,true):'时间待确认';
    const health=document.getElementById('update-health');
    health.textContent=savedData?'备用记录':!v.available?'时间待确认':v.warnings.length?'部分待更新':'';health.hidden=!health.textContent;
    if(!v.available){document.getElementById('update-details-body').innerHTML='<p class="update-note">更新时间记录暂不可用，数据日期以各项资料为准。</p>';return;}
    const last=(r)=>r.last_checked_at?updateTime(r.last_checked_at):(r.key==='news'||r.key.startsWith('technology:'))?'暂无完整查新记录':'暂无核查记录';
    const rows=v.rows.map(r=>`<article class="update-row" data-update-key="${esc(r.key)}"><h3>${esc(r.label)}</h3><dl class="update-times"><div><dt>${(r.key==='news'||r.key.startsWith('technology:'))?'上次全部来源查新':'上次核查'}</dt><dd>${last(r)}</dd></div><div><dt>下次计划启动</dt><dd>${r.next_at?`约 ${updateTime(r.next_at)}`:esc(r.next_label)}</dd></div></dl>${r.key==='quote'?`<p class="update-note">行情交易日 ${esc(updateCore.marketDate(Date.parse(data.quote.as_of)))}</p>`:''}${(r.key==='news'||r.key.startsWith('technology:'))&&r.last_content_update_at?`<p class="update-note">最近收录 ${updateTime(r.last_content_update_at)}</p>`:''}<p class="update-note">${esc(r.rule)}</p>${r.warning?`<p class="update-issue">${esc(r.warning)}</p>`:''}</article>`).join('');
    const finances=v.financial.map(f=>`约 ${updateTime(f.at)} · ${esc(f.label)}`).join('<br>');
    const financialWarnings=v.warnings.filter(w=>!v.rows.some(r=>r.warning&&(w===r.warning||w===r.label+'：'+r.warning)));
    const companyChecks=v.companies.map(c=>`<li><span>${esc(c.name)}</span><span>${c.last_checked_at?updateTime(c.last_checked_at):'暂无核查记录'}</span></li>`).join('');
    document.getElementById('update-details-body').innerHTML=`<div class="update-next"><p>下次计划启动${v.next?' · '+esc(v.next.label):''}</p><strong>${v.next?`约 ${updateTime(v.next.at)}`:'暂无已确认的计划时间'}</strong><p class="update-note">以下时间均为美西时间 PT · 实际完成时间以核查结果为准</p></div>${savedData?'<p class="update-issue">当前显示已保存资料；更新时间与安排也来自该版本。</p>':''}${rows}<article class="update-row" data-update-key="financial"><h3>各公司财报与指引</h3><dl class="update-times"><div><dt>上次核查</dt><dd><details class="update-companies"><summary>查看各公司记录</summary><ul>${companyChecks}</ul></details></dd></div><div><dt>下次计划启动</dt><dd>${finances||(!updateStatus.schedule.earnings.enabled?'计划已暂停':'日期待确认')}</dd></div></dl><p class="update-note">确认财报后约 24 小时定向核查；指引修订与更正随新披露处理。周日补查未确认的下一财报日期。</p><p class="update-note">美光当前 ${esc(data.financial_period)} · 原报告发布 ${esc(data.financial_published_at)}</p>${financialWarnings.map(w=>`<p class="update-issue">${esc(w)}</p>`).join('')}</article><p class="update-footnote">上次更新是成功核查并写入新内容的时间；查新没有变化时，只记录对应核查时间。计划启动不保证资料已经核实或发布。</p><a class="update-history" href="#updates" data-panel-link="updates">来源与完整更新记录 →</a>`;
  }
  const panelWarnings=section=>updateCore.warnings(data,Date.now(),section).map(w=>`<p class="section-warning" role="status">${esc(w)}</p>`).join('');
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
    return `<article class="card metric" id="${esc(metric.id)}"><div class="metric-top"><div class="metric-heading"><h3><span class="metric-number">${String(index+1).padStart(2,'0')}</span>${esc(metric.title)}</h3></div><p class="micro">${esc(metric.period)}</p><p class="definition">${esc(metric.definition)}</p></div>${metric.rows.slice(0,2).map(evidence).join('')}<details class="evidence-details"><summary>${metric.rows.length>2?`展开其余 ${metric.rows.length-2} 项数据与口径`:'查看口径说明'}</summary>${metric.rows.slice(2).map(evidence).join('')}<div class="review"><h4>口径与缺失数据</h4><ul>${metric.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p class="micro">引用审校 ${esc(metric.checked_at)} UTC · 下次更新 ${esc(metric.next_review)}</p></div></details><div class="interpretation"><h4>简要解读</h4><p>${esc(metric.interpretation)}</p>${data.technology&&['supply','hbm'].includes(metric.id)?`<a class="detail-link" data-tech-link="${metric.id==='supply'?'manufacturing':'product-comparison'}" href="#${metric.id==='supply'?'manufacturing':'product-comparison'}">${metric.id==='supply'?'工厂产能与制程进展':'DDR5 / HBM 技术对照'} →</a>`:''}${metric.interpretation_sources?.length?`<div class="source-links">${metric.interpretation_sources.map(id=>sourceLink(id)).join('')}</div>`:''}</div></article>`;
  }
  function factCard(card) {
    const metric=data.metrics.find(m=>m.id===card.metric_id),row=metric.rows.find(r=>card.row_id?r.id===card.row_id:r.label===card.row_label);
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
  function partnerMetric(row,company) {
    const source=data.sources[row.source_ids[0]],change=partnerChange(row);
    return `<tr><th scope="row"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(company.name+' '+row.label+' 数据来源')}" title="${esc(row.location)}">${esc(row.label)} <span aria-hidden="true">↗</span></a><small>${esc(partnerUnits[row.unit])}${row.evidence_type!=='direct'?` · ${provenance[row.evidence_type]}`:''}</small></th><td><strong>${partnerValue(row.current,row.unit,row.digits)}</strong>${change?`<small class="partner-change">${esc(change)}</small>`:''}</td><td class="partner-previous">${partnerValue(row.previous,row.unit,row.digits)}</td></tr>`;
  }
  function partnerOutlook(item) {
    return `<div class="partner-outlook-item ${item.type==='numeric'?'numeric-outlook':''}"><div class="outlook-label"><h5>${esc(item.label)}</h5><span class="kind forecast">${esc(item.kind)}</span>${item.evidence_type!=='direct'?`<span class="basis ${esc(item.evidence_type)}">${provenance[item.evidence_type]}</span>`:''}</div><p class="outlook-period">${esc(item.period)}</p>${item.value?`<p class="outlook-value">${esc(item.value)}</p>`:''}${item.prior_guidance?`<p class="prior-guidance">前次：${esc(item.prior_guidance)}</p>`:''}${item.summary?`<p class="outlook-summary">${esc(item.summary)}</p>`:''}<p class="outlook-byline">${esc(item.speaker)} · ${esc(item.issued_at)}</p><div class="source-links">${item.source_ids.map(id=>sourceLink(id)).join('')}</div><p class="source-location">${esc(item.location)}</p></div>`;
  }
  function partnerCard(company) {
    return `<article class="card partner-card" id="partner-${esc(company.id)}"><header class="partner-header"><div><p class="partner-role">${esc(company.role)}</p><h3>${esc(company.name)}</h3></div><span class="partner-ticker">${esc(company.ticker)}</span></header><p class="partner-date">财季截至 ${esc(company.period_end)} · 发布 ${esc(company.published_at)}</p><p class="partner-scope">${esc(company.scope)}</p><div class="partner-facts"><h4>财报实绩<span>同比对照</span></h4><table class="partner-table"><caption class="sr-only">${esc(company.name)} ${esc(company.period)} 财报与上年同期比较，变化为同比</caption><thead><tr><th scope="col">指标 / 单位</th><th scope="col">本期<small>${esc(company.period)}</small></th><th scope="col">上年同期<small>${esc(company.previous_period)}</small></th></tr></thead><tbody>${company.metrics.map(r=>partnerMetric(r,company)).join('')}</tbody></table></div><details class="partner-outlook"><summary><span>指引与展望 <small>${company.outlook.length} 条</small></span><span class="disclosure-arrow" aria-hidden="true">⌄</span></summary><p class="outlook-intro">按披露时点记录 · 中文摘要</p>${company.outlook.map(partnerOutlook).join('')}</details><details class="partner-notes"><summary>数据口径与来源</summary><div>${company.metrics.map(r=>`<section><h5>${esc(r.label)}</h5>${r.note?`<p>${esc(r.note)}</p>`:''}<p>${esc(r.location)}</p><div class="source-links">${r.source_ids.map(id=>sourceLink(id)).join('')}</div></section>`).join('')}${company.notes.length?`<ul>${company.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}<p class="micro">核查 ${esc(company.checked_at)} UTC</p></div></details></article>`;
  }
  function ecosystem() {
    const e=data.ecosystem;
    return `${technology.comparison(data)}<div class="data-heading"><h2>产业链跟踪</h2><span>${e.companies.length} 家公司</span></div><p class="section-intro">客户投入、算力建设与存储供给。</p><div class="ecosystem-tabs" role="group" aria-label="产业链分组">${e.groups.map(g=>`<button type="button" data-ecosystem-group="${esc(g.id)}" aria-pressed="${g.id===ecosystemGroup}">${esc(g.title)}<span>${e.companies.filter(c=>c.group===g.id).length}</span></button>`).join('')}</div>${e.groups.map(g=>`<section class="ecosystem-group" id="ecosystem-${esc(g.id)}" aria-label="${esc(g.title)}" ${g.id===ecosystemGroup?'':'hidden'}><p class="group-description">${esc(g.description)}</p><nav class="company-jumps" aria-label="${esc(g.title)}公司跳转">${e.companies.filter(c=>c.group===g.id).map(c=>`<a href="#partner-${esc(c.id)}" data-partner="${esc(c.id)}">${esc(c.name.split(' / ')[0])}</a>`).join('')}</nav>${e.companies.filter(c=>c.group===g.id).map(partnerCard).join('')}</section>`).join('')}<p class="ecosystem-footnote">资本开支涵盖设备、网络与厂房等投入；内存采购未单独披露。产业链资料核查 ${checkDate(e.checked_at)}。</p>`;
  }
  function selectEcosystemGroup(group) {
    if(!data.ecosystem.groups.some(g=>g.id===group)) return;
    ecosystemGroup=group;
    document.querySelectorAll('.ecosystem-group').forEach(el=>el.hidden=el.id!==`ecosystem-${group}`);
    document.querySelectorAll('[data-ecosystem-group]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.ecosystemGroup===group)));
  }
  function calendarView(){
    const companies=[{id:'micron',name:'美光',period:data.financial_period,published_at:data.financial_published_at},...data.ecosystem.companies];
    const states=updateCore.states(data),upcoming=(data.monitoring?.calendar||[]).filter(e=>e.scheduled_at.slice(0,10)>(companies.find(c=>c.id===e.company_id)?.published_at||'').slice(0,10)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at));
    return `${upcoming.map(e=>`<article class="card event"><p class="micro">${esc(e.confirmation==='confirmed'?'已确认':'预计')} · ${esc(e.period)}</p><h3>${esc(e.title)}</h3><p>${date(e.scheduled_at,true)}</p><div class="source-links">${e.source_ids.map(id=>sourceLink(id)).join('')}</div></article>`).join('')}<details class="card calendar-details"><summary>查看 ${companies.length} 家公司披露日程</summary><div>${companies.map(c=>{const state=states.find(s=>s.key==='company:'+c.id),next=upcoming.find(e=>e.company_id===c.id);return `<article class="calendar-company"><h3>${esc(c.name)}</h3><p>${esc(c.period)} · 披露 ${esc(c.published_at)}</p><p>${next?`下次：${date(next.scheduled_at,true)}`:'下次披露日期待确认'}</p><p class="micro">${esc(state.check_kind)} ${checkDate(state.checked_at)}</p></article>`;}).join('')}</div></details>`;
  }
  function newsCard(item){
    const n=data.news,companyNames=item.companies.map(id=>n.entities[id]||id).join(' · ');
    const facts=item.fact_refs.map(ref=>n.fact_records[ref.record_id]).filter(Boolean);
    return `<article class="card news-card" id="news-${esc(item.id)}"><div class="news-byline"><time datetime="${esc(item.published_at)}">${date(item.published_at)}</time><span>${esc(n.categories[item.category])}</span></div><h3>${esc(item.title)}</h3><p class="news-companies">${esc(companyNames)}</p><div class="tag-group">${tags(item)}</div><p class="news-summary">${esc(item.summary)}</p>${facts.map(record=>{const row=record.payload;return `<div class="news-fact"><p class="row-label">${esc(row.label)}</p><div class="tag-group">${tags(row)}</div>${numberLine(row)}<p class="row-period">${esc(row.period||record.context.period)}</p><div class="source-links">${record.context.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">原始数据 ↗</a>`).join('')}</div></div>`;}).join('')}${item.technology_refs?.length?`<p class="news-tracking">${item.technology_refs.map(id=>`<a href="#tech-${esc(id)}" data-tech-link="tech-${esc(id)}">查看当前技术进展 →</a>`).join('')}</p>`:''}<p class="row-period">${esc(item.period)}</p><div class="source-links">${item.source_ids.map(id=>sourceLink(id)).join('')}</div><details class="news-details"><summary>原文位置与口径</summary><p>${esc(item.location)}</p>${item.note?`<p>${esc(item.note)}</p>`:''}${item.interpretation?`<p>${esc(item.interpretation)}</p>`:''}${item.updated_at.slice(0,10)!==item.published_at.slice(0,10)?`<p class="micro">更新 ${date(item.updated_at)}</p>`:''}</details></article>`;
  }
  function news(){
    const n=data.news||{items:[],categories:{},entities:{}},items=updateCore.filterNews(data,{category:newsCategory,company:newsCompany,days:newsDays});
    const state=updateCore.states(data).find(s=>s.key==='news');
    return `<div class="data-heading"><h2>AI 动态</h2><span>${items.length} 条</span></div><p class="section-intro">内存供需、客户投入与 AI 产品进展。</p>${panelWarnings('news')}<div class="news-filters"><label>类别<select id="news-category"><option value="all">全部类别</option>${Object.entries(n.categories).map(([id,name])=>`<option value="${esc(id)}" ${id===newsCategory?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>公司<select id="news-company"><option value="all">全部公司</option>${Object.entries(n.entities).filter(([id])=>n.items.some(item=>item.companies.includes(id))).map(([id,name])=>`<option value="${esc(id)}" ${id===newsCompany?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>期间<select id="news-days"><option value="30" ${newsDays===30?'selected':''}>近 30 天</option><option value="all" ${newsDays===null?'selected':''}>全部记录</option></select></label></div><p class="micro news-check">${state.checked_at?`最近查新 ${checkDate(state.checked_at)}`:'按各条原文日期收录'} · 周日、周三检查新资料</p><div id="news-list">${items.length?items.map(newsCard).join(''):'<p class="empty">这个筛选范围暂无已核实的动态。</p>'}</div>`;
  }
  function overview() {
    return `<div class="data-heading"><h2>关键数据</h2><span>${esc(data.financial_period)}</span></div><p class="section-intro">财季截至 ${esc(data.financial_as_of)} · 发布 ${esc(data.financial_published_at)}</p><div class="fact-grid">${data.overview.fact_cards.map(factCard).join('')}</div><a class="all-data" href="#business" data-panel-link="business">查看全部公司数据 →</a>${technology.highlights(data)}<div class="section-heading"><h2>下一季公司指引</h2><span class="small">预测 · 尚未实现</span></div><section class="card guidance-card">${data.guidance.map(guidanceRow).join('')}</section><a class="all-data" href="#ecosystem" data-panel-link="ecosystem">查看产业链数据与指引 →</a><div class="section-heading"><h2>披露日程</h2></div>${calendarView()}<div class="section-heading"><h2>尚未取得的数据</h2></div><ul class="gap-list">${data.overview.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul><div class="quote-line"><span>MU 常规收盘</span><strong>$${num(data.quote.price)}</strong><span>${date(data.quote.as_of)}</span>${sourceLink(data.quote.source_id)}</div>`;
  }
  function updates() {
    return `<section class="card update-status"><div class="line"><span>最近全量原文核查</span><strong>${checkDate(data.last_successful_check_at,true)}</strong></div><div class="line"><span>最近引用审校</span><strong>${checkDate(data.last_source_audit_at,true)}</strong></div><div class="line"><span>财报覆盖期间</span><strong>${esc(data.financial_period)}<br><span>截至 ${esc(data.financial_as_of)}</span></strong></div><div class="line"><span>持续核查</span><strong>${data.automation.enabled?esc(data.automation.cadence):'尚未启用'}</strong></div><p>${esc(data.automation.note)} 核查日不等于原始发布日期，引用审校也不等于行情更新。核查时间用 UTC；交易与活动时间用 ET。</p><button class="button" id="refresh-data" style="margin-top:14px">载入最新记录</button><p id="refresh-state" role="status"></p></section><div class="section-heading"><h2>证据标记</h2></div><div class="provenance-key"><p><b>直接披露</b>：来源明确给出这个指标。</p><p><b>本页计算</b>：由已列明输入及公式计算。</p><p><b>间接指标</b>：用于侧面观察另一变量，不能替代其直接数据。</p><p><b>媒体转引</b>：已核对转引报道，未读取原始表格。</p><p><b>未取得</b>：暂无可核实数值。</p><p>“直接披露”标明证据来源；是否为实际、估计或预测，以旁边的类型标签为准。</p></div><div class="section-heading"><h2>数据来源</h2></div><div class="source-directory">${Object.entries(data.sources).map(([id,s])=>`<div class="source-entry">${sourceLink(id,true)}<p>${esc(s.locator||'')}<br>${esc(s.type)} · 发布 ${esc(s.published_at||'未标注')} · 核查 ${esc(s.checked_at)} UTC</p></div>`).join('')}</div><div class="section-heading"><h2>修订记录</h2></div><ol class="timeline">${data.changes.slice(0,5).map(c=>`<li><time>${esc(c.date)}</time><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>核查记录</h2></div><ol class="timeline">${data.check_log.slice(0,7).map(c=>`<li><time>${checkDate(c.at,true)} · ${esc(({full:'全量原文',micron:'美光财报',industry:'行业资料',quote:'常规收盘',ecosystem:'产业链财报',source_audit:'引用审校',discovery:'公告查新',news:'AI 动态',calendar:'披露日程',maintenance:'更新规则',batch:'定向更新'})[c.scope]||c.scope)} · ${c.status==='success'?'完成':c.status==='failed'?'未完成':'部分完成'}</time><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>口径说明</h2></div><ul class="method">${data.methodology.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`;
  }
  function show(panel,updateHash=true) {
    if(!['overview','business','industry','ecosystem','news','updates'].includes(panel)) panel='overview';
    document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==`panel-${panel}`);
    document.querySelectorAll('.nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));
    if(updateHash) history.replaceState(null,'',`#${panel}`);
  }
  function navigateHash(scroll=true) {
    const key=location.hash.slice(1),metric=data.metrics.find(m=>m.id===(key==='valuation'?'revenue':key));
    if(key.startsWith('news-')&&data.news?.items.some(n=>'news-'+n.id===key)){newsCategory='all';newsCompany='all';newsDays=null;document.getElementById('panel-news').innerHTML=news();show('news',false);if(scroll)document.getElementById(key)?.scrollIntoView({block:'start'});return;}
    const techItem=technology.select(data,key);
    if(techItem||['manufacturing','factories','processes','product-comparison'].includes(key)){
      const product=techItem?.type==='product'||key==='product-comparison';
      if(product&&data.technology)document.getElementById('product-comparison').outerHTML=technology.comparison(data);
      show(product?'ecosystem':'business',false);
      if(scroll)document.getElementById(key)?.scrollIntoView({block:'start'});return;
    }
    const partner=data.ecosystem.companies.find(c=>`partner-${c.id}`===key);
    if(partner) {show('ecosystem',false);selectEcosystemGroup(partner.group);if(scroll)document.getElementById(key)?.scrollIntoView({behavior:'instant',block:'start'});return;}
    const group=data.ecosystem.groups.find(g=>`ecosystem-${g.id}`===key);
    if(group) {show('ecosystem',false);selectEcosystemGroup(group.id);return;}
    show(metric?metric.category:key,false);
    if(scroll&&metric) document.getElementById(metric.id)?.scrollIntoView({behavior:'instant',block:'start'});
  }
  function render(fallback=false) {
    renderUpdatePanel();
    const warnings=[];
    if(fallback) warnings.unshift(`未能载入最新记录，显示 ${checkDate(data.updated_at,true)} 保存的备用资料。`);
    document.getElementById('freshness').innerHTML=warnings.map(w=>`<div class="banner" role="status">${esc(w)}</div>`).join('');
    document.getElementById('panel-overview').innerHTML=panelWarnings('overview')+overview();
    for(const category of ['business','industry']) {
      const manufacturing=category==='business'?technology.manufacturing(data):'';
      const title=category==='business'?(manufacturing?'财务与经营数据':'公司数据'):'行业数据';
      const intro=category==='business'?'财务金额为亿美元；FQ 为美光财季。各项附来源和原文位置。':'行业估计、报价与预测分别标识；用于观察终端消耗的间接指标单独说明。';
      const heading=manufacturing?`<div class="section-heading"><h2>${title}</h2></div>`:`<h2>${title}</h2>`;
      document.getElementById(`panel-${category}`).innerHTML=panelWarnings(category)+manufacturing+heading+`<p class="section-intro">${intro}</p>${data.metrics.map((m,i)=>m.category===category?metricCard(m,i):'').join('')}`;
    }
    document.getElementById('panel-updates').innerHTML=updates();
    document.getElementById('panel-ecosystem').innerHTML=panelWarnings('ecosystem')+ecosystem();
    document.getElementById('panel-news').innerHTML=news();
    document.getElementById('refresh-data').addEventListener('click',()=>load(true));
    navigateHash(false);document.getElementById('loading').hidden=true;
  }
  async function load(refresh=false) {
    const feedback=document.getElementById('refresh-state');
    if(refresh&&feedback) feedback.textContent='正在载入已发布的记录…';
    try {
      const read=async file=>{const response=await fetch(`${file}?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();};
      const [documentResult,statusResult]=await Promise.allSettled([read('data/monitor.json'),read('data/update-status.json')]);
      if(documentResult.status!=='fulfilled')throw documentResult.reason;
      const next=documentResult.value;
      if(!validate(next)) throw new Error('Invalid data');
      data=next;updateStatus=statusResult.status==='fulfilled'&&updateTimes.matches(next,statusResult.value)?statusResult.value:null;savedData=false;
      render();
      if(refresh) document.getElementById('refresh-state').textContent=`已载入 ${checkDate(data.updated_at,true)} 发布的记录${updateStatus?'。':'；更新时间记录暂不可用。'}`;
    } catch(error) {
      savedData=true;
      if(!data) {data=JSON.parse(document.getElementById('fallback-data').textContent);const fallback=JSON.parse(document.getElementById('fallback-update-status').textContent);updateStatus=updateTimes.matches(data,fallback)?fallback:null;render(true);}
      else {renderUpdatePanel();document.getElementById('freshness').innerHTML=`<div class="banner" role="alert">最新记录载入失败，保留 ${checkDate(data.updated_at,true)} 的资料。</div>`;if(feedback)feedback.textContent='载入失败，请稍后重试。';}
    }
  }
  document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.panel);window.scrollTo({top:0,behavior:'instant'});}));
  document.addEventListener('click',event=>{
    const techLink=event.target.closest('[data-tech-link]');if(techLink){event.preventDefault();history.replaceState(null,'','#'+techLink.dataset.techLink);navigateHash();return;}
    const groupButton=event.target.closest('[data-ecosystem-group]');
    if(groupButton){selectEcosystemGroup(groupButton.dataset.ecosystemGroup);history.replaceState(null,'',`#ecosystem-${ecosystemGroup}`);return;}
    const partnerLink=event.target.closest('[data-partner]');
    if(partnerLink){event.preventDefault();history.replaceState(null,'',`#partner-${partnerLink.dataset.partner}`);navigateHash();return;}
    const link=event.target.closest('[data-metric],[data-panel-link]');if(!link)return;
    event.preventDefault();history.replaceState(null,'',`#${link.dataset.metric||link.dataset.panelLink}`);navigateHash();
    if(link.dataset.panelLink) window.scrollTo({top:0,behavior:'instant'});
  });
  document.addEventListener('change',event=>{const id=event.target.id;if(['tech-family','tech-peer','tech-micron-model'].includes(id)){technology.change(id,event.target.value);document.getElementById('product-comparison').outerHTML=technology.comparison(data);document.getElementById(id)?.focus();return;}if(!['news-category','news-company','news-days'].includes(id))return;if(id==='news-category')newsCategory=event.target.value;if(id==='news-company')newsCompany=event.target.value;if(id==='news-days')newsDays=event.target.value==='all'?null:30;document.getElementById('panel-news').innerHTML=news();document.getElementById(id)?.focus();});
  window.addEventListener('hashchange',()=>navigateHash());
  setInterval(renderUpdatePanel,60000);
  load().then(()=>navigateHash());
})();
