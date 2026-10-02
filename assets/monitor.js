/* Facts first. Data, provenance and short interpretations are kept separate. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const {rowChange,freshness,isRenderable:validate,guidanceActuals,guidanceComparison,partnerValue,partnerChange,groupTotal,cycleSignals,cycleLayout,companyOutlook,isCompanyRow,provenance,partnerUnits}=globalThis.MonitorCore;
  const num = (value,digits=2) => Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const updateCore=globalThis.MonitorUpdates;
  const updateTimes=globalThis.MonitorUpdateTimes;
  const technology=globalThis.TechnologyUI;
  const agent=globalThis.MonitorOutlook;
  let data,outlook=null,updateStatus,savedData=false,updatePanelState,ecosystemGroup='cloud';
  function updateTime(value,short=false){return value?`<time datetime="${esc(value)}">${esc(updateTimes.format(value,short))}</time>`:'暂无记录';}
  function renderUpdatePanel(){
    if(!data)return;
    const v=updateTimes.view(data,updateStatus),signature=JSON.stringify([v,savedData]);
    if(signature===updatePanelState)return;updatePanelState=signature;
    document.getElementById('last-data-update').innerHTML=v.last_at?updateTime(v.last_at,true):'时间待确认';
    const health=document.getElementById('update-health');
    health.textContent=savedData?'备用记录':!v.available?'时间待确认':v.warnings.length?'部分待更新':'';health.hidden=!health.textContent;
    if(!v.available){document.getElementById('update-details-body').innerHTML='<p class="update-note">更新时间记录暂不可用，数据日期以各项资料为准。</p>';return;}
    const last=(r)=>r.last_checked_at?updateTime(r.last_checked_at):r.key.startsWith('technology:')?'暂无完整查新记录':'暂无核查记录';
    const rows=v.rows.map(r=>`<article class="update-row" data-update-key="${esc(r.key)}"><h3>${esc(r.label)}</h3><dl class="update-times"><div><dt>${r.key.startsWith('technology:')?'上次全部来源查新':'上次核查'}</dt><dd>${last(r)}</dd></div><div><dt>下次计划启动</dt><dd>${r.next_at?`约 ${updateTime(r.next_at)}`:esc(r.next_label)}</dd></div></dl>${r.key==='quote'?`<p class="update-note">行情交易日 ${esc(updateCore.marketDate(Date.parse(data.quote.as_of)))}</p>`:''}${r.key.startsWith('technology:')&&r.last_content_update_at?`<p class="update-note">最近收录 ${updateTime(r.last_content_update_at)}</p>`:''}<p class="update-note">${esc(r.rule)}</p>${r.warning?`<p class="update-issue">${esc(r.warning)}</p>`:''}</article>`).join('');
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
  function unitName(unit) {return {USDm:'亿美元',pct:'%',USD:'美元',days:'天',multiple:'倍',TWDb:'十亿新台币',KRWt:'万亿韩元'}[unit]||unit;}
  function numberLine(row,compact=false) {
    const previous=row.previous!==null&&row.previous!==undefined;
    const current=row.current!==null&&row.current!==undefined;
    return `<div class="numbers ${compact?'compact-numbers':''}">${previous?`<span class="previous">${formatted(row.previous,row.unit)}</span><span class="arrow" aria-label="变为">→</span>`:''}<span class="current ${typeof row.current!=='number'?'text-value':''}">${formatted(row.current,row.unit)}${current&&row.unit?`<span class="unit">${esc(unitName(row.unit))}</span>`:''}</span></div>${rowChange(row)?`<div class="change-line">${esc(rowChange(row))}</div>`:''}`;
  }
  function tags(row) {
    const kind=/预测|指引|计划/.test(row.kind)?'forecast':row.evidence_type==='unavailable'?'missing':'';
    return `<span class="kind ${kind}">${esc(row.kind)}</span>${row.evidence_type==='direct'?'':`<span class="basis ${esc(row.evidence_type)}">${provenance[row.evidence_type]}</span>`}`;
  }
  function evidence(row) {
    return `<div class="evidence-row ledger-row"><div class="ledger-label"><span class="row-label">${esc(row.label)}</span><span class="tag-group">${tags(row)}</span><p class="row-period">${esc(row.period)}</p></div><div class="ledger-value">${numberLine(row)}</div><div class="source-links">${row.source_ids.map(id=>sourceLink(id)).join('')}</div></div>`;
  }
  function rowBasis(row) {
    return `<li><b>${esc(row.label)}</b>${row.note?`<p class="row-note">${esc(row.note)}</p>`:''}<p class="source-location">定位：${esc(row.location)} · ${provenance[row.evidence_type]}</p></li>`;
  }
  function metricCard(metric,index,{skip=()=>false}={}) {
    metric={...metric,rows:metric.rows.filter(r=>!skip(metric,r))};
    return `<article class="card metric" id="${esc(metric.id)}"><div class="metric-top"><div class="metric-heading"><h3><span class="metric-number">${String(index+1).padStart(2,'0')}</span>${esc(metric.title)}</h3></div><p class="micro">${esc(metric.period)}</p><p class="definition">${esc(metric.definition)}</p></div>${metric.rows.slice(0,4).map(evidence).join('')}<details class="evidence-details"><summary>${metric.rows.length>4?`展开其余 ${metric.rows.length-4} 项数据与原文位置`:'口径与原文位置'}</summary>${metric.rows.slice(4).map(evidence).join('')}<ul class="row-basis">${metric.rows.map(rowBasis).join('')}</ul><div class="review"><h4>口径与缺失数据</h4><ul>${metric.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p class="micro">引用审校 ${esc(metric.checked_at)} UTC · 下次更新 ${esc(metric.next_review)}</p></div></details><div class="interpretation"><h4>简要解读</h4><p>${esc(metric.interpretation)}</p>${data.technology&&['supply','hbm'].includes(metric.id)?`<a class="detail-link" data-tech-link="${metric.id==='supply'?'manufacturing':'hbm-progress'}" href="#${metric.id==='supply'?'manufacturing':'hbm-progress'}">${metric.id==='supply'?'工厂产能与制程进展':'HBM 三家进度'} →</a>`:''}${metric.interpretation_sources?.length?`<div class="source-links">${metric.interpretation_sources.map(id=>sourceLink(id)).join('')}</div>`:''}</div></article>`;
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
  function groupCapex(group) {
    const companies=data.ecosystem.companies.filter(c=>c.group===group.id),total=companies.length>1?groupTotal(companies,'capex'):null;
    if(!total) return '';
    const label=companies[0].metrics.find(r=>r.id==='capex').label,ends=new Set(total.parts.map(p=>p.period_end));
    return `<article class="card group-total" aria-label="${esc(group.title)}${esc(label)}合计"><div class="row-top"><h3>${esc(group.title)}：${esc(label)}合计</h3><span class="tag-group"><span class="basis calculated">${provenance.calculated}</span></span></div><div class="numbers"><span class="previous">${partnerValue(total.previous,total.unit)}</span><span class="arrow" aria-label="变为">→</span><span class="current">${partnerValue(total.current,total.unit)}<span class="unit">${esc(partnerUnits[total.unit])}</span></span></div>${total.change?`<div class="change-line">同比 ${esc(total.change)}</div>`:''}<p class="row-note">各公司最近一个已披露财季相加，对照各自上年同期。${ends.size>1?'各公司财季截止日不同，合计不是同一日历季度。':''}</p><ul class="group-parts">${total.parts.map(p=>`<li><a href="#partner-${esc(p.id)}" data-partner="${esc(p.id)}">${esc(p.name.split(' / ')[0])}</a><span>${esc(p.period)} · 截至 ${esc(p.period_end)}</span><strong>${partnerValue(p.current,total.unit)}</strong></li>`).join('')}</ul></article>`;
  }
  function outlookCard() {
    const items=companyOutlook(data);
    if(!items.length) return '';
    return `<section class="card metric company-outlook" id="company-outlook"><div class="metric-top"><h3>美光展望</h3><p class="definition">公司对行业供需的表述，属预测，不是实际数据。</p></div>${items.map(({row})=>evidence(row)).join('')}<details class="evidence-details"><summary>口径与原文位置</summary><ul class="row-basis">${items.map(({row})=>rowBasis(row)).join('')}</ul></details></section>`;
  }
  // Past quarters from data.series plus the live quarter from the row itself; each number is stored once.
  function trendPoints(metric,row) {
    const past=data.series?.[`mu.${metric.id}.${row.id}`];
    if(!past?.length||typeof row.current!=='number') return [];
    return [...past.map(p=>({period:p.financial_period,value:p.value})),{period:data.financial_period,value:row.current}].slice(-8);
  }
  function sparkline(points,unit) {
    if(points.length<2) return '';
    const w=200,h=36,pad=5,values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
    const xy=points.map((p,i)=>[pad+i*(w-2*pad)/(points.length-1),h-pad-(p.value-min)/span*(h-2*pad)]);
    const label=points.map(p=>`${p.period} ${formatted(p.value,unit)}${unitName(unit)}`).join('；');
    return `<figure class="sparkline"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polyline points="${xy.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" vector-effect="non-scaling-stroke"/>${xy.map(([x,y],i)=>`<g><circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/><circle class="dot${i===xy.length-1?' last':''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i===xy.length-1?4:2.5}"/><title>${esc(points[i].period)}：${formatted(points[i].value,unit)}${esc(unitName(unit))}</title></g>`).join('')}</svg><figcaption><span>${esc(points[0].period)}</span><span>${esc(points.at(-1).period)}</span></figcaption></figure>`;
  }
  function cycleSignal({metric,row}) {
    const value=typeof row.current==='number'?`${formatted(row.current,row.unit)}${row.unit?`<span class="unit">${esc(unitName(row.unit))}</span>`:''}`:esc(row.current);
    return `<a class="card cycle-signal" href="#${esc(metric.id)}" data-metric="${esc(metric.id)}"><span class="signal-label">${metric.category==='business'?(/^[A-Za-z]/.test(row.label)?'美光 ':'美光'):''}${esc(row.label)}</span><strong class="signal-value">${value}</strong>${rowChange(row)?`<span class="change-line">${esc(rowChange(row))}</span>`:''}<span class="row-period">${esc(row.period)}</span>${sparkline(trendPoints(metric,row),row.unit)}<span class="tag-group">${tags(row)}</span></a>`;
  }
  function capexSignal() {
    const group=data.ecosystem.groups.find(g=>g.id==='cloud'),companies=data.ecosystem.companies.filter(c=>c.group==='cloud'),total=companies.length>1?groupTotal(companies,'capex'):null;
    if(!group||!total) return '';
    return `<a class="card cycle-signal" href="#cycle-demand"><span class="signal-label">${companies.length} 家云厂商资本开支合计</span><strong class="signal-value">${partnerValue(total.current,total.unit)}<span class="unit">${esc(partnerUnits[total.unit])}</span></strong>${total.change?`<span class="change-line">同比 ${esc(total.change)}</span>`:''}<span class="row-period">各公司最近财季</span><span class="tag-group"><span class="basis calculated">${provenance.calculated}</span></span></a>`;
  }
  function cycle() {
    const sections=cycleLayout(data);
    return `<div class="data-heading"><h2>周期跟踪</h2></div><p class="section-intro">价格、供给与需求的行业资料。行业估计、报价与预测分别标识；美光自身财务见“公司”。</p><div class="section-heading"><h2>周期信号</h2><span class="small">各项最新读数 · 点击查看来源</span></div><div class="signal-grid">${cycleSignals(data).map(cycleSignal).join('')}${capexSignal()}</div>${sections.map(s=>`<section class="cycle-section" id="cycle-${esc(s.id)}" aria-label="${esc(s.title)}"><div class="section-heading"><h2>${esc(s.title)}</h2></div>${s.metrics.map(m=>metricCard(m,data.metrics.indexOf(m),{skip:isCompanyRow})).join('')}${s.id==='supply'?technology.hbmProgress(data):''}${s.id==='demand'?data.ecosystem.groups.map(groupCapex).join(''):''}</section>`).join('')}`;
  }
  function ecosystem() {
    const e=data.ecosystem;
    return `<div class="data-heading"><h2>产业链跟踪</h2><span>${e.companies.length} 家公司</span></div><p class="section-intro">客户投入、算力建设与存储供给。</p><div class="ecosystem-tabs" role="group" aria-label="产业链分组">${e.groups.map(g=>`<button type="button" data-ecosystem-group="${esc(g.id)}" aria-pressed="${g.id===ecosystemGroup}">${esc(g.title)}<span>${e.companies.filter(c=>c.group===g.id).length}</span></button>`).join('')}</div>${e.groups.map(g=>`<section class="ecosystem-group" id="ecosystem-${esc(g.id)}" aria-label="${esc(g.title)}" ${g.id===ecosystemGroup?'':'hidden'}><p class="group-description">${esc(g.description)}</p><nav class="company-jumps" aria-label="${esc(g.title)}公司跳转">${e.companies.filter(c=>c.group===g.id).map(c=>`<a href="#partner-${esc(c.id)}" data-partner="${esc(c.id)}">${esc(c.name.split(' / ')[0])}</a>`).join('')}</nav>${e.companies.filter(c=>c.group===g.id).map(partnerCard).join('')}</section>`).join('')}<p class="ecosystem-footnote">资本开支涵盖设备、网络与厂房等投入；内存采购未单独披露。产业链资料核查 ${checkDate(e.checked_at)}。</p>`;
  }
  function selectEcosystemGroup(group) {
    if(!data.ecosystem.groups.some(g=>g.id===group)) return;
    ecosystemGroup=group;
    document.querySelectorAll('.ecosystem-group').forEach(el=>el.hidden=el.id!==`ecosystem-${group}`);
    document.querySelectorAll('[data-ecosystem-group]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.ecosystemGroup===group)));
  }
  function calendarView(){
    const companies=[{id:'micron',name:'美光',period:data.financial_period,published_at:data.financial_published_at},...data.ecosystem.companies];
    const now=Date.now(),states=updateCore.states(data,now),unrecorded=(data.monitoring?.calendar||[]).filter(e=>e.scheduled_at.slice(0,10)>(companies.find(c=>c.id===e.company_id)?.published_at||'').slice(0,10)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at));
    // An event whose time has passed but whose report is not yet in the record is shown as released and pending, never as upcoming.
    const released=e=>e.confirmation==='confirmed'&&Date.parse(e.scheduled_at)<=now,upcoming=unrecorded.filter(e=>!released(e)),pending=unrecorded.filter(released);
    const eventCard=e=>`<article class="card event${released(e)?' event-pending':''}"><p class="micro">${released(e)?'已发布 · 本页待录入':e.confirmation==='confirmed'?'已确认':Date.parse(e.scheduled_at)<=now?'预计日期已过 · 待确认':'预计'} · ${esc(e.period)}</p><h3>${esc(e.title)}</h3><p>${date(e.scheduled_at,true)}</p><div class="source-links">${e.source_ids.map(id=>sourceLink(id)).join('')}</div></article>`;
    return `${[...pending,...upcoming].map(eventCard).join('')}<details class="card calendar-details"><summary>查看 ${companies.length} 家公司披露日程</summary><div>${companies.map(c=>{const state=states.find(s=>s.key==='company:'+c.id),next=upcoming.find(e=>e.company_id===c.id),waiting=pending.find(e=>e.company_id===c.id);return `<article class="calendar-company"><h3>${esc(c.name)}</h3><p>${esc(c.period)} · 披露 ${esc(c.published_at)}</p>${waiting?`<p>${esc(waiting.period)} 已于 ${date(waiting.scheduled_at)} 发布，待录入</p>`:''}<p>${next?`下次：${date(next.scheduled_at,true)}`:waiting?'':'下次披露日期待确认'}</p><p class="micro">${esc(state.check_kind)} ${checkDate(state.checked_at)}</p></article>`;}).join('')}</div></details>`;
  }
  function quoteLine() {
    const q=data.quote,change=Number.isFinite(q.previous_close)&&q.previous_close>0?rowChange({current:q.price,previous:q.previous_close,unit:'USD'}):'';
    return `<div class="quote-line"><span>MU 常规收盘</span><strong>$${num(q.price)}</strong>${change?`<span class="quote-change">较前一交易日 ${esc(change)}</span>`:''}<span>${date(q.as_of)}</span>${sourceLink(q.source_id)}</div>`;
  }
  // Stored agent analysis: rendered only when every citation resolves to the facts loaded on this page.
  function agentOutlook() {
    if(!agent||!outlook||agent.validate(outlook,data).length) return '';
    const text=value=>agent.segments(value,data).map(s=>s.text!==undefined?esc(s.text):`<b class="ao-value">${esc(s.value)}</b>`).join('');
    // Past-quarter points of one metric collapse into a single period range.
    const refs=ids=>{
      const links=[],series=new Map();
      for(const id of ids){const item=agent.resolve(data,id);if(id.startsWith('series.')){const key=id.slice(7).split('@')[0];if(!series.has(key)){series.set(key,[]);links.push(key);}series.get(key).push(item);}else links.push(item);}
      const html=links.map(x=>{if(typeof x!=='string')return `<a href="${esc(x.href)}">${esc(x.label)}</a>`;const items=series.get(x).sort((a,b)=>a.period.localeCompare(b.period)),name=agent.resolve(data,x).label,first=items[0].period,last=items[items.length-1].period;return `<a href="${esc(items[0].href)}">${esc(name)} · ${esc(first===last?first:first+' 至 '+last)}</a>`;});
      return `<span class="ao-refs">依据：${html.join('<span aria-hidden="true">、</span>')}</span>`;
    };
    const sections=outlook.sections.map(s=>`<section class="ao-section"><h3>${esc(s.title)}</h3><ul>${s.points.map(p=>`<li><p>${text(p.text)}</p>${refs(p.refs)}</li>`).join('')}</ul></section>`).join('');
    return `<details class="card agent-outlook" id="agent-outlook"><summary><span class="ao-head"><span class="ao-label">Agent 分析</span><span class="ao-stance ${esc(outlook.stance)}">${esc(agent.stances[outlook.stance])}</span><span class="ao-date">${esc(date(outlook.generated_at))} 生成</span><span class="ao-chevron" aria-hidden="true">⌄</span></span><span class="ao-summary">${text(outlook.summary)}</span></summary><div class="ao-body">${sections}<p class="ao-note">由 AI agent 仅根据本站已发布的数据撰写，每条结论列出引用的指标，数字随站内数据显示；不构成投资建议。依据 ${esc(outlook.financial_period)} 财报及截至生成日的行业与产业链数据。</p></div></details>`;
  }
  function overview() {
    return `${agentOutlook()}<div class="data-heading"><h2>关键数据</h2><span>${esc(data.financial_period)}</span></div><p class="section-intro">财季截至 ${esc(data.financial_as_of)} · 发布 ${esc(data.financial_published_at)}</p>${quoteLine()}<div class="fact-grid">${data.overview.fact_cards.map(factCard).join('')}</div><a class="all-data" href="#business" data-panel-link="business">查看全部公司数据 →</a><a class="all-data" href="#industry" data-panel-link="industry">查看周期信号：价格、供给与需求 →</a>${technology.highlights(data)}<div class="section-heading"><h2>下一季公司指引</h2><span class="small">预测 · 尚未实现</span></div><section class="card guidance-card">${data.guidance.map(guidanceRow).join('')}</section><a class="all-data" href="#ecosystem" data-panel-link="ecosystem">查看产业链数据与指引 →</a><div class="section-heading"><h2>披露日程</h2></div>${calendarView()}<div class="section-heading"><h2>尚未取得的数据</h2></div><ul class="gap-list">${data.overview.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>`;
  }
  function updates() {
    return `<section class="card update-status"><div class="line"><span>最近全量原文核查</span><strong>${checkDate(data.last_successful_check_at,true)}</strong></div><div class="line"><span>最近引用审校</span><strong>${checkDate(data.last_source_audit_at,true)}</strong></div><div class="line"><span>财报覆盖期间</span><strong>${esc(data.financial_period)}<br><span>截至 ${esc(data.financial_as_of)}</span></strong></div><div class="line"><span>持续核查</span><strong>${data.automation.enabled?esc(data.automation.cadence):'尚未启用'}</strong></div><p>${esc(data.automation.note)} 核查日不等于原始发布日期，引用审校也不等于行情更新。核查时间用 UTC；交易与活动时间用 ET。</p><button class="button" id="refresh-data" style="margin-top:14px">载入最新记录</button><p id="refresh-state" role="status"></p></section><div class="section-heading"><h2>证据标记</h2></div><div class="provenance-key"><p><b>直接披露</b>：来源明确给出这个指标。</p><p><b>本页计算</b>：由已列明输入及公式计算。</p><p><b>间接指标</b>：用于侧面观察另一变量，不能替代其直接数据。</p><p><b>媒体转引</b>：已核对转引报道，未读取原始表格。</p><p><b>未取得</b>：暂无可核实数值。</p><p>“直接披露”标明证据来源；是否为实际、估计或预测，以旁边的类型标签为准。</p></div><div class="section-heading"><h2>数据来源</h2></div><div class="source-directory">${Object.entries(data.sources).map(([id,s])=>`<div class="source-entry">${sourceLink(id,true)}<p>${esc(s.locator||'')}<br>${esc(s.type)} · 发布 ${esc(s.published_at||'未标注')} · 核查 ${esc(s.checked_at)} UTC</p></div>`).join('')}</div><div class="section-heading"><h2>修订记录</h2></div><ol class="timeline">${data.changes.slice(0,5).map(c=>`<li><time>${esc(c.date)}</time><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>核查记录</h2></div><ol class="timeline">${data.check_log.slice(0,7).map(c=>`<li><time>${checkDate(c.at,true)} · ${esc(({full:'全量原文',micron:'美光财报',industry:'行业资料',quote:'常规收盘',ecosystem:'产业链财报',source_audit:'引用审校',discovery:'公告查新',news:'AI 动态',calendar:'披露日程',maintenance:'更新规则',batch:'定向更新'})[c.scope]||c.scope)} · ${c.status==='success'?'完成':c.status==='failed'?'未完成':'部分完成'}</time><p>${esc(c.text)}</p></li>`).join('')}</ol><div class="section-heading"><h2>口径说明</h2></div><ul class="method">${data.methodology.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`;
  }
  function show(panel,updateHash=true) {
    if(panel==='cycle'||panel?.startsWith('cycle-')) panel='industry';
    if(!['overview','business','industry','ecosystem','updates'].includes(panel)) panel='overview';
    document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==`panel-${panel}`);
    document.querySelectorAll('.nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));
    if(updateHash) history.replaceState(null,'',`#${panel}`);
  }
  function navigateHash(scroll=true) {
    const key=location.hash.slice(1),metric=data.metrics.find(m=>m.id===(key==='valuation'?'revenue':key));
    const techItem=technology.select(data,key);
    if(techItem||['manufacturing','factories','processes','products','hbm-progress','product-comparison'].includes(key)){
      // The old 同类产品对照 anchor now lands on the HBM row in 周期.
      const target=key==='product-comparison'?'hbm-progress':key,hbm=['hbm-progress','product-comparison'].includes(key)||(techItem&&technology.place(techItem)==='industry');
      show(hbm?'industry':'business',false);
      // Products without a card of their own (peer DDR5) fall back to the manufacturing section.
      const el=document.getElementById(target)||(techItem?document.getElementById('manufacturing'):null);
      if(el?.closest('#hbm-specs'))document.getElementById('hbm-specs').open=true;
      if(scroll)el?.scrollIntoView({block:'start'});return;
    }
    const partner=data.ecosystem.companies.find(c=>`partner-${c.id}`===key);
    if(partner) {show('ecosystem',false);selectEcosystemGroup(partner.group);if(scroll)document.getElementById(key)?.scrollIntoView({behavior:'instant',block:'start'});return;}
    const group=data.ecosystem.groups.find(g=>`ecosystem-${g.id}`===key);
    if(group) {show('ecosystem',false);selectEcosystemGroup(group.id);return;}
    show(metric?metric.category:key,false);
    if(scroll&&key.startsWith('cycle-')) document.getElementById(key)?.scrollIntoView({behavior:'instant',block:'start'});
    if(scroll&&metric) document.getElementById(metric.id)?.scrollIntoView({behavior:'instant',block:'start'});
  }
  function render(fallback=false) {
    renderUpdatePanel();
    const warnings=[];
    if(fallback) warnings.unshift(`未能载入最新记录，显示 ${checkDate(data.updated_at,true)} 保存的备用资料。`);
    document.getElementById('freshness').innerHTML=warnings.map(w=>`<div class="banner" role="status">${esc(w)}</div>`).join('');
    document.getElementById('panel-overview').innerHTML=panelWarnings('overview')+overview();
    document.getElementById('panel-industry').innerHTML=panelWarnings('industry')+cycle();
    for(const category of ['business']) {
      const manufacturing=category==='business'?technology.manufacturing(data):'';
      const title=category==='business'?(manufacturing?'财务与经营数据':'公司数据'):'行业数据';
      const intro=category==='business'?'财务金额为亿美元；FQ 为美光财季。各项附来源和原文位置。':'行业估计、报价与预测分别标识；用于观察终端消耗的间接指标单独说明。';
      const heading=`<h2>${title}</h2>`;
      document.getElementById(`panel-${category}`).innerHTML=panelWarnings(category)+heading+`<p class="section-intro">${intro}</p>${outlookCard()}${data.metrics.map((m,i)=>m.category===category?metricCard(m,i):'').join('')}`+manufacturing;
    }
    document.getElementById('panel-updates').innerHTML=updates();
    document.getElementById('panel-ecosystem').innerHTML=panelWarnings('ecosystem')+ecosystem();
    document.getElementById('refresh-data').addEventListener('click',()=>load(true));
    navigateHash(false);document.getElementById('loading').hidden=true;
  }
  async function load(refresh=false) {
    const feedback=document.getElementById('refresh-state');
    if(refresh&&feedback) feedback.textContent='正在载入已发布的记录…';
    try {
      const read=async file=>{const response=await fetch(`${file}?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();};
      const [documentResult,statusResult,outlookResult]=await Promise.allSettled([read('data/monitor.json'),read('data/update-status.json'),read('data/outlook.json')]);
      if(documentResult.status!=='fulfilled')throw documentResult.reason;
      const next=documentResult.value;
      if(!validate(next)) throw new Error('Invalid data');
      data=next;outlook=outlookResult.status==='fulfilled'?outlookResult.value:outlook||JSON.parse(document.getElementById('fallback-outlook')?.textContent||'null');updateStatus=statusResult.status==='fulfilled'&&updateTimes.matches(next,statusResult.value)?statusResult.value:null;savedData=false;
      render();
      if(refresh) document.getElementById('refresh-state').textContent=`已载入 ${checkDate(data.updated_at,true)} 发布的记录${updateStatus?'。':'；更新时间记录暂不可用。'}`;
    } catch(error) {
      savedData=true;
      if(!data) {data=JSON.parse(document.getElementById('fallback-data').textContent);outlook=JSON.parse(document.getElementById('fallback-outlook')?.textContent||'null');const fallback=JSON.parse(document.getElementById('fallback-update-status').textContent);updateStatus=updateTimes.matches(data,fallback)?fallback:null;render(true);}
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
  window.addEventListener('hashchange',()=>navigateHash());
  setInterval(renderUpdatePanel,60000);
  load().then(()=>navigateHash());
})();
