(function(){
  'use strict';
  const core=globalThis.MonitorTechnology;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link=(id,text)=>`<a href="#${esc(id)}" data-tech-link="${esc(id)}">${esc(text)} →</a>`;
  const stage=i=>`<span class="tech-stage">${esc(core.stages[i.stage])}</span>`;
  const date=i=>`${i.date_basis==='page_checked'?'产品页核查':'进展披露'} ${esc(i.as_of)}`;
  const warnings=(data,topic)=>globalThis.MonitorUpdates.warnings(data,Date.now(),'technology:'+topic).map(w=>`<p class="section-warning" role="status">${esc(w)}</p>`).join('');
  function sources(data,ids){return `<div class="source-links">${ids.map(id=>{const s=data.sources[id];return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.short_label)} ↗</a>`;}).join('')}</div>`;}
  function nature(f){return `<span class="kind ${f.nature==='plan'?'forecast':f.nature==='unavailable'?'missing':''}">${esc(core.kinds[f.nature])}</span>`;}
  function field(f,compact=false){
    if(!f)return '<span class="muted">未披露</span>';
    return `<div class="tech-value">${esc(core.value(f))}</div><div class="tech-fact-meta">${nature(f)}${compact?'':`<span>${esc(f.period)}</span>`}</div>${f.baseline?`<p class="tech-baseline">基准：${esc(f.baseline)}</p>`:''}`;
  }
  function history(data,i){
    const rows=data.technology.history?.[i.id]||[];
    if(!rows.length)return '';
    return `<details class="tech-history"><summary>已记录披露${rows.length>1?` · 最近 ${rows.length} 个版本`:''}</summary>${rows.map(r=>`<article><p class="micro">${esc(r.payload.as_of)} · ${esc(core.stages[r.payload.stage])}</p><p>${esc(r.payload.summary)}</p><div class="source-links">${r.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">当时来源 ↗</a>`).join('')}</div></article>`).join('')}</details>`;
  }
  function details(data,i){
    return `<details class="tech-evidence"><summary>规格、测试条件与来源</summary>${i.facts.map(f=>`<article class="tech-evidence-fact"><h4>${esc(f.label)}</h4>${field(f)}${f.note?`<p>${esc(f.note)}</p>`:''}<p class="micro">${esc(i.date_basis==='page_checked'?'页面核查':'原披露')} ${esc(f.as_of)} · ${esc(f.location)}</p>${sources(data,f.source_ids)}</article>`).join('')}${i.note?`<p class="tech-note">${esc(i.note)}</p>`:''}</details>${history(data,i)}`;
  }
  function card(data,i){
    const chosen=i.type==='facility'?(i.id==='sanand'?['output_2026','output_2027']:['next_milestone','capacity']):['bit_density','adoption','next_milestone'];
    // Undisclosed key facts collapse into one line; their dates and sources stay in the evidence details.
    const facts=chosen.map(id=>core.fact(i,id)).filter(Boolean),gaps=facts.filter(f=>f.nature==='unavailable');
    return `<article class="card tech-card" id="tech-${esc(i.id)}"><header><div class="tech-kicker">${esc(i.type==='facility'?core.roles[i.role]:i.family)} · ${esc(i.type==='facility'?i.family:'制程换代')}</div><div class="tech-title"><h3>${esc(i.name)}</h3>${stage(i)}</div><p class="micro">${date(i)}</p><p class="tech-summary">${esc(i.summary)}</p></header>${i.type==='process'?`<ol class="tech-steps" aria-label="当前阶段：${esc(core.stages[i.stage])}"><li>送样</li><li>客户验证</li><li class="${['production','ramping'].includes(i.stage)?'reached':''}">量产</li><li class="${i.stage==='ramping'?'reached':''}">爬坡</li></ol>`:''}<dl class="tech-key-facts">${facts.filter(f=>f.nature!=='unavailable').map(f=>`<div><dt>${esc(f.label)}</dt><dd>${field(f)}</dd></div>`).join('')}</dl>${gaps.length?`<p class="tech-gaps">未披露：${gaps.map(f=>esc(f.label)).join('、')}</p>`:''}<div class="tech-card-sources">${sources(data,i.source_ids)}</div>${i.type==='process'?`<p class="tech-note">${esc(i.note)}</p>`:''}${details(data,i)}</article>`;
  }
  function manufacturing(data){
    const items=data.technology?.items;if(!items)return '';
    const hbm=items.filter(i=>i.type==='product'&&i.company_id==='micron'&&i.family.startsWith('hbm')),ddr5=items.filter(i=>i.type==='product'&&i.company_id==='micron'&&!i.family.startsWith('hbm'));
    return `<section id="manufacturing" class="tech-section"><div class="data-heading"><h2>美光制造与技术</h2></div><p class="section-intro">重点制造项目、制程效率与下一里程碑。各条保留原披露日期。</p><nav class="tech-jumps" aria-label="制造与技术跳转">${link('factories','工厂与产能')}${link('processes','制程换代')}${link('products','DDR5 产品')}${link('hbm-progress','HBM 三家进度')}</nav><h3 id="factories" class="tech-subheading">工厂与产能</h3>${warnings(data,'facilities')}<div class="tech-grid">${items.filter(i=>i.type==='facility').map(i=>card(data,i)).join('')}</div><h3 id="processes" class="tech-subheading">制程换代</h3>${warnings(data,'processes')}<div class="tech-grid">${items.filter(i=>i.type==='process').map(i=>card(data,i)).join('')}</div><article class="card tech-hbm"><h3>HBM 代际与封装</h3><div>${hbm.map(i=>`<p>${link('tech-'+i.id,i.name)} ${stage(i)}<span class="micro"> ${esc(i.as_of)}</span></p>`).join('')}</div><p class="tech-note">DRAM 制程、堆叠封装和产品代际共同跟踪；三家对照见“周期”。</p></article>${ddr5.length?`<h3 id="products" class="tech-subheading">DDR5 产品</h3>${warnings(data,'products')}<div class="tech-product-details">${ddr5.map(i=>product(data,i)).join('')}</div>`:''}</section>`;
  }
  function highlights(data){
    if(!data.technology)return '';
    return `<div class="section-heading"><h2>制造与技术进展</h2></div><section class="card tech-highlights">${data.technology.highlights.map(id=>data.technology.items.find(i=>i.id===id)).map(i=>`<article><div><h3>${link('tech-'+i.id,i.name)}</h3><p>${esc(i.summary)}</p></div><p class="micro">${esc(i.as_of)}<br>${esc(core.stages[i.stage])}</p></article>`).join('')}</section>`;
  }
  function product(data,i){
    return `<article class="card tech-product" id="tech-${esc(i.id)}"><header><h3>${esc(core.companies[i.company_id])} · ${esc(i.name)}</h3><p class="micro">${stage(i)} ${date(i)}</p><p>${esc(i.summary)}</p>${sources(data,i.source_ids)}</header>${details(data,i)}</article>`;
  }
  // HBM stage per maker sits under 供给 on the cycle tab; specs stay one click away.
  const hbmFamilies=['hbm4','hbm4e'],makers=['micron','samsung','skhynix'];
  const isHbm=i=>i?.type==='product'&&hbmFamilies.includes(i.family);
  function hbmProgress(data){
    const items=data.technology?.items;if(!items)return '';
    const hbm=items.filter(isHbm);if(!hbm.length)return '';
    const cell=i=>i?`<a href="#tech-${esc(i.id)}" data-tech-link="tech-${esc(i.id)}">${stage(i)}</a><p class="micro">${esc(i.as_of)}</p>`:'<span class="muted">暂无披露</span>';
    const rows=hbmFamilies.map(f=>`<tr><th scope="row">${esc(core.groups[f])}</th>${makers.map(c=>`<td>${cell(hbm.find(i=>i.family===f&&i.company_id===c))}</td>`).join('')}</tr>`).join('');
    return `<section id="hbm-progress" class="tech-section hbm-progress"><h3 class="tech-subheading">HBM 三家进度</h3><p class="section-intro">三家厂商各代 HBM 的最新披露阶段与日期；点击查看规格与来源。</p>${warnings(data,'products')}<div class="card tech-table-wrap"><table class="tech-table hbm-table"><caption class="sr-only">HBM 各代三家厂商阶段</caption><thead><tr><th scope="col">代际</th>${makers.map(c=>`<th scope="col">${esc(core.companies[c])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><details id="hbm-specs" class="hbm-specs"><summary>规格、测试条件与来源</summary><div class="tech-product-details">${hbmFamilies.flatMap(f=>makers.map(c=>hbm.find(i=>i.family===f&&i.company_id===c))).filter(Boolean).map(i=>product(data,i)).join('')}</div></details></section>`;
  }
  // Where a product lives: HBM on the cycle tab, Micron's other products on the company tab.
  function place(item){return isHbm(item)?'industry':'business';}
  function select(data,id){return data.technology?.items.find(i=>'tech-'+i.id===id);}
  globalThis.TechnologyUI={manufacturing,highlights,hbmProgress,place,select};
})();
