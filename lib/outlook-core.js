/* Agent outlook: a stored analysis whose every number and claim cites a fact already published on this site. */
(function () {
  'use strict';
  const core=typeof module!=='undefined'&&module.exports?require('./monitor-core.js'):globalThis.MonitorCore;
  const stances={positive:'整体向好',negative:'整体偏弱',wait:'待更多数据'};
  const fields=['current','previous','change'];
  // Prose carries no quantities of its own: numbers enter only through {{ref}} tokens, so every figure is a live site value.
  const allowedDigits=/FY20\d{2}(\s*F?Q[1-4])?|20\d{2}\s*Q[1-4]|\bF?Q[1-4]\b|20\d{2}\s*(自然)?年|HBM\d[A-Z]?|L?P?DDR\d|SOCAMM\d|\d{3}\s*层/g;
  const adviceTerms=/买入|卖出|增持|减持|加仓|减仓|持有|目标价|估值|评级|股价|抄底|止损|看多|看空|做多|做空|仓位|市盈率|市净率/;
  const tokenPattern=/\{\{([^{}|]+?)(?:\|([^{}]*))?\}\}/g;
  const num=(value,digits)=>Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const units={USDm:'亿美元',pct:'%',USD:'美元',days:'天',multiple:'倍',TWDb:'十亿新台币',KRWt:'万亿韩元'};

  function format(value,unit) {
    if(value===null||value===undefined) return '未取得';
    if(typeof value!=='number') return String(value);
    const digits=unit==='pct'?1:unit==='days'||unit==='份'?0:unit==='USDm'||unit==='USD'||unit==='multiple'?2:Math.abs(value)<100?2:1;
    const name=units[unit]??unit??'';
    const text=num(unit==='USDm'?value/100:value,digits);
    return `${unit==='USDm'?text.replace(/\.0+$/,''):text}${unit==='pct'?'%':name?' '+name:''}`;
  }

  // Ref ids reuse the pipeline's stable record identities (pipeline/model.mjs entries) plus series points.
  function resolve(data,ref) {
    const parts=ref.split('.');
    if(ref.startsWith('series.')) {
      const [metricId,period]=ref.slice(7).split('@'),point=data.series?.[metricId]?.find(p=>p.financial_period===period);
      const row=metricId.startsWith('mu.')?resolve(data,metricId):null;
      if(!point||!row) return null;
      return {ref,label:`${row.label} · ${period}`,current:point.value,previous:null,unit:point.unit,period,href:row.href};
    }
    if(parts[0]==='mu'&&parts.length===3) {
      const metric=data.metrics.find(m=>m.id===parts[1]),row=metric?.rows.find(r=>r.id===parts[2]);
      return row?{ref,label:row.label,current:row.current??null,previous:row.previous??null,unit:row.unit,period:row.period,change:core.rowChange(row),href:'#'+metric.id}:null;
    }
    if(parts[0]==='guidance'&&parts.length===2) {
      const row=data.guidance.find(g=>g.id===parts[1]);
      if(!row) return null;
      // Mirrors the guidance card: midpoint ± range, or "约" for approximate guidance.
      const compact=v=>num(row.unit==='USDm'?v/100:v,2).replace(/\.?0+$/,''),unit=row.unit==='pct'?'%':' '+(units[row.unit]??row.unit);
      const display=row.tolerance!=null?`${compact(row.current)} ± ${compact(row.tolerance)}${unit}`:`${row.approximate?'约 ':''}${compact(row.current)}${unit}`;
      return {ref,label:`${row.period} ${row.label}指引`,current:row.current,previous:null,unit:row.unit,period:row.period,display,href:'#overview'};
    }
    if((parts[0]==='eco'||parts[0]==='outlook')&&parts.length===3) {
      const company=data.ecosystem.companies.find(c=>c.id===parts[1]);
      const row=company?.[parts[0]==='eco'?'metrics':'outlook'].find(r=>r.id===parts[2]);
      if(!row) return null;
      const name=company.name;
      if(parts[0]==='outlook') return {ref,label:`${name} · ${row.label}`,current:row.value??row.summary,previous:null,unit:null,period:row.period,detail:[row.summary||'',row.prior_guidance||''],href:`#partner-${company.id}`};
      return {ref,label:`${name} · ${row.label}`,current:row.current??null,previous:row.previous??null,unit:row.unit,period:company.period,change:core.partnerChange(row),href:`#partner-${company.id}`};
    }
    return null;
  }

  // Everything a token or claim can lean on: values, reported changes, guidance ranges, prior guidance.
  const snapshot=item=>({current:item.current,previous:item.previous,...(item.change?{change:item.change}:{}),...(item.display?{display:item.display}:{}),...(item.detail?{detail:item.detail}:{})});
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function tokens(text) {return [...String(text).matchAll(tokenPattern)].map(m=>({raw:m[0],ref:m[1].trim(),field:m[2]||'current',index:m.index}));}
  function points(outlook) {
    return [{path:'summary',text:outlook.summary,refs:outlook.summary_refs||[]},...(outlook.sections||[]).flatMap((s,i)=>(s.points||[]).map((p,j)=>({path:`sections/${i}/points/${j}`,text:p.text,refs:p.refs||[]})))];
  }
  function citedRefs(outlook) {return [...new Set(points(outlook).flatMap(p=>[...p.refs,...tokens(p.text).map(t=>t.ref)]))];}

  function validate(outlook,data) {
    const issues=[],add=(code,path,message)=>issues.push({code,path,message});
    if(!outlook||outlook.format_version!==1){add('OUTLOOK_SHAPE','outlook','Expected format_version 1');return issues;}
    if(!stances[outlook.stance])add('OUTLOOK_STANCE','stance','Stance must be positive, negative or wait');
    if(!Number.isFinite(Date.parse(outlook.generated_at)))add('OUTLOOK_DATE','generated_at','Invalid generation time');
    if(outlook.financial_period!==data.financial_period)add('OUTLOOK_STALE','financial_period','A new reporting quarter requires a rewritten analysis');
    if(typeof outlook.summary!=='string'||!outlook.summary.trim()||outlook.summary.length>120)add('OUTLOOK_SHAPE','summary','One-line summary of at most 120 characters');
    if(!Array.isArray(outlook.sections)||!outlook.sections.length)add('OUTLOOK_SHAPE','sections','At least one section is required');
    for(const [i,s] of (outlook.sections||[]).entries()){
      if(typeof s.title!=='string'||!s.title.trim()||!Array.isArray(s.points)||!s.points.length)add('OUTLOOK_SHAPE',`sections/${i}`,'Each section needs a title and points');
      else if(/[\p{Nd}\p{No}]/u.test(s.title.replace(allowedDigits,''))||adviceTerms.test(s.title)||/[{}]/.test(s.title))add('OUTLOOK_TITLE',`sections/${i}/title`,'Titles follow the prose rules and carry no numbers or tokens');
    }
    for(const p of points(outlook)) {
      if(typeof p.text!=='string'||!p.text.trim()){add('OUTLOOK_SHAPE',p.path,'Empty text');continue;}
      if(!p.refs.length)add('OUTLOOK_CITATION',p.path,'Every claim must cite at least one site metric');
      for(const t of tokens(p.text)){
        const item=resolve(data,t.ref);
        if(!fields.includes(t.field))add('OUTLOOK_TOKEN',p.path,`Unknown field ${t.field}`);
        else if(item&&(t.field==='change'?!item.change:item[t.field]===null||item[t.field]===undefined))add('OUTLOOK_TOKEN',p.path,`${t.ref} has no ${t.field} value to show`);
        if(!p.refs.includes(t.ref))add('OUTLOOK_CITATION',p.path,`Token ${t.ref} must also be listed in refs`);
      }
      const prose=p.text.replace(tokenPattern,'').replace(allowedDigits,'');
      if(/[{}]/.test(prose))add('OUTLOOK_TOKEN',p.path,'Malformed {{ref}} token');
      if(/[\p{Nd}\p{No}]/u.test(prose))add('OUTLOOK_NUMBER',p.path,'Numbers must come from {{ref}} tokens, not prose');
      if(adviceTerms.test(p.text))add('OUTLOOK_ADVICE',p.path,'No trading, valuation or rating language');
    }
    const cited=citedRefs(outlook);
    for(const ref of cited) {
      const item=resolve(data,ref);
      if(!item){add('OUTLOOK_REFERENCE',ref,'Cited metric is not published on the site');continue;}
      if(!outlook.cited?.[ref])add('OUTLOOK_SNAPSHOT',ref,'Run outlook-stamp after writing the analysis');
      else if(!same(outlook.cited[ref],snapshot(item)))add('OUTLOOK_STALE',ref,'Cited value changed since the analysis was written; re-read and rewrite or re-stamp');
    }
    for(const ref of Object.keys(outlook.cited||{}))if(!cited.includes(ref))add('OUTLOOK_SNAPSHOT',ref,'Snapshot lists a metric the analysis does not cite');
    return issues;
  }

  // Splits text into literal strings and resolved token values for the renderer.
  function segments(text,data) {
    const out=[];let last=0;
    for(const t of tokens(text)) {
      if(t.index>last) out.push({text:text.slice(last,t.index)});
      const item=resolve(data,t.ref);
      out.push({value:t.field==='change'?item?.change||'':t.field==='current'&&item?.display?item.display:format(item?.[t.field],item?.unit),ref:t.ref});
      last=t.index+t.raw.length;
    }
    if(last<text.length) out.push({text:text.slice(last)});
    return out;
  }

  const api={stances,resolve,format,validate,segments,citedRefs,snapshot};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else globalThis.MonitorOutlook=Object.freeze(api);
})();
