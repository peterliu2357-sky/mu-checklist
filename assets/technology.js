(function(){
  'use strict';
  const core=globalThis.MonitorTechnology;
  let group='ddr5_rdimm',peer='samsung',micronModel='micron_rdimm512';
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
    return `<article class="card tech-card" id="tech-${esc(i.id)}"><header><div class="tech-kicker">${esc(i.type==='facility'?core.roles[i.role]:i.family)} · ${esc(i.type==='facility'?i.family:'制程换代')}</div><div class="tech-title"><h3>${esc(i.name)}</h3>${stage(i)}</div><p class="micro">${date(i)}</p><p class="tech-summary">${esc(i.summary)}</p></header>${i.type==='process'?`<ol class="tech-steps" aria-label="当前阶段：${esc(core.stages[i.stage])}"><li>送样</li><li>客户验证</li><li class="${['production','ramping'].includes(i.stage)?'reached':''}">量产</li><li class="${i.stage==='ramping'?'reached':''}">爬坡</li></ol>`:''}<dl class="tech-key-facts">${chosen.map(id=>core.fact(i,id)).filter(Boolean).map(f=>`<div><dt>${esc(f.label)}</dt><dd>${field(f)}</dd></div>`).join('')}</dl><div class="tech-card-sources">${sources(data,i.source_ids)}</div>${i.type==='process'?`<p class="tech-note">${esc(i.note)}</p>`:''}${details(data,i)}</article>`;
  }
  function manufacturing(data){
    const items=data.technology?.items;if(!items)return '';
    const hbm=items.filter(i=>i.type==='product'&&i.company_id==='micron'&&i.family.startsWith('hbm'));
    return `<section id="manufacturing" class="tech-section"><div class="section-heading"><h2>美光制造与技术</h2></div><p class="section-intro">重点制造项目、制程效率与下一里程碑。各条保留原披露日期。</p><nav class="tech-jumps" aria-label="制造与技术跳转">${link('factories','工厂与产能')}${link('processes','制程换代')}${link('product-comparison','同类产品')}</nav><h3 id="factories" class="tech-subheading">工厂与产能</h3>${warnings(data,'facilities')}<div class="tech-grid">${items.filter(i=>i.type==='facility').map(i=>card(data,i)).join('')}</div><h3 id="processes" class="tech-subheading">制程换代</h3>${warnings(data,'processes')}<div class="tech-grid">${items.filter(i=>i.type==='process').map(i=>card(data,i)).join('')}</div><article class="card tech-hbm"><h3>HBM 代际与封装</h3><div>${hbm.map(i=>`<p>${link('tech-'+i.id,i.name)} ${stage(i)}<span class="micro"> ${esc(i.as_of)}</span></p>`).join('')}</div><p class="tech-note">DRAM 制程、堆叠封装和产品代际共同跟踪。</p></article></section><div class="section-heading"><h2>财务与经营数据</h2></div>`;
  }
  function highlights(data){
    if(!data.technology)return '';
    return `<div class="section-heading"><h2>制造与技术进展</h2></div><section class="card tech-highlights">${data.technology.highlights.map(id=>data.technology.items.find(i=>i.id===id)).map(i=>`<article><div><h3>${link('tech-'+i.id,i.name)}</h3><p>${esc(i.summary)}</p></div><p class="micro">${esc(i.as_of)}<br>${esc(core.stages[i.stage])}</p></article>`).join('')}</section>`;
  }
  function comparison(data){
    const items=data.technology?.items;if(!items)return '';
    const cols=core.comparison(items,group,peer),models=items.filter(i=>i.type==='product'&&i.family===group&&i.company_id==='micron');
    cols[0].item=models.find(i=>i.id===micronModel)||models[0];
    const mobile=c=>c.mobile?'':' tech-desktop';
    const row=(label,render)=>`<tr><th scope="row">${label}</th>${cols.map(c=>`<td class="${mobile(c)}">${c.item?render(c.item):'暂无可核实披露'}</td>`).join('')}</tr>`;
    const rows=[row('产品 / 阶段',i=>`<strong>${esc(i.name)}</strong>${stage(i)}<p class="micro">${date(i)}</p>`),...['capacity','speed',...(group==='ddr5_rdimm'?[]:['stack','bandwidth']),'process','next_milestone','power'].map(id=>row(({capacity:group==='ddr5_rdimm'?'单模块容量':'单堆栈容量',speed:group==='ddr5_rdimm'?'速率':'单针速率',stack:'堆叠',bandwidth:'带宽',process:'制程 / 封装',next_milestone:'后续里程碑',power:'绝对功耗'})[id],i=>field(core.fact(i,id)))),row('厂商自比',i=>{const f=core.fact(i,'power_change');return f?`<p class="micro">${esc(f.label)}</p>${field(f)}`:'未披露';})].join('');
    const powerComparable=cols.slice(1).filter(c=>c.mobile).some(c=>core.comparablePower(cols[0].item,c.item));
    return `<section id="product-comparison" class="tech-section"><div class="section-heading"><h2>同类产品对照</h2></div><p class="section-intro">规格与商业化阶段并列；容量按模块或堆栈记录，GB 与裸片 Gb 分别标识。</p>${warnings(data,'products')}<div class="tech-controls"><label>产品类型<select id="tech-family">${Object.entries(core.groups).map(([id,label])=>`<option value="${id}" ${group===id?'selected':''}>${label}</option>`).join('')}</select></label>${models.length>1?`<label>美光规格<select id="tech-micron-model">${models.map(i=>`<option value="${esc(i.id)}" ${cols[0].item?.id===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></label>`:''}<label class="tech-peer-control">对照公司<select id="tech-peer"><option value="samsung" ${peer==='samsung'?'selected':''}>三星</option><option value="skhynix" ${peer==='skhynix'?'selected':''}>SK 海力士</option></select></label></div><p class="tech-comparison-note">${powerComparable?'已有匹配测试条件的绝对功耗记录，详细条件见下方。':'跨厂商功耗：缺少相同平台、容量、速率与负载下的完整测试。厂商自比栏保留各自基准。'}</p><div class="card tech-table-wrap"><table class="tech-table"><caption class="sr-only">${esc(core.groups[group])} 产品规格及进展对照</caption><thead><tr><th scope="col">指标</th>${cols.map(c=>`<th scope="col" class="${mobile(c)}">${esc(core.companies[c.company])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><div class="tech-product-details">${cols.filter(c=>c.item).map(c=>`<article class="card tech-product ${mobile(c)}" id="tech-${esc(c.item.id)}"><header><h3>${esc(core.companies[c.company])} · ${esc(c.item.name)}</h3><p>${esc(c.item.summary)}</p>${sources(data,c.item.source_ids)}</header>${details(data,c.item)}</article>`).join('')}</div></section>`;
  }
  function select(data,id){const i=data.technology?.items.find(i=>'tech-'+i.id===id);if(i?.type==='product'){group=i.family;if(i.company_id==='micron')micronModel=i.id;else peer=i.company_id;}return i;}
  function change(id,value){if(id==='tech-family')group=value;if(id==='tech-peer')peer=value;if(id==='tech-micron-model')micronModel=value;}
  globalThis.TechnologyUI={manufacturing,highlights,comparison,select,change};
})();
