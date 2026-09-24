/* Facts first. Data, provenance and short interpretations are kept separate. */
(function () {
  'use strict';
  
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
      const source=dataset.metrics.find(m=>m.id===ref.metric_id)?.rows.find(r=>ref.row_id?r.id===ref.row_id:r.label===ref.row_label);
      return {...ref,value:source?.[ref.field],unit:source?.unit,source_ids:source?.source_ids||[]};
    });
  }
  function guidanceComparison(row,dataset) {
    const actuals=guidanceActuals(row,dataset),latest=actuals[actuals.length-1];
    if(!latest||!Number.isFinite(latest.value)||latest.value===0||!Number.isFinite(row.current)) return null;
    const difference=row.unit==='pct'?row.current-latest.value:(row.current/latest.value-1)*100;
    return {period:latest.period,value:difference,unit:row.unit==='pct'?'个百分点':'%'};
  }
  const partnerUnits={USDm:'亿美元',TWDb:'十亿新台币',KRWt:'万亿韩元',pct:'%'};
  function partnerValue(value,unit,digits) {
    if(!Number.isFinite(value)) return '—';
    return num(unit==='USDm'?value/100:value,digits??(unit==='pct'?1:2));
  }
  function partnerChange(row) {
    if(row.change) return row.change;
    if(!Number.isFinite(row.current)||!Number.isFinite(row.previous)) return '';
    const delta=row.current-row.previous,sign=delta>0?'+':delta<0?'−':'';
    if(row.unit==='pct') return `${sign}${num(Math.abs(delta),1)} 个百分点`;
    if(row.change_mode==='absolute'||row.previous<=0) return `${sign}${partnerValue(Math.abs(delta),row.unit,row.digits)} ${partnerUnits[row.unit]}`;
    return `${sign}${num(Math.abs(delta/row.previous)*100,1)}%`;
  }
  function validateEcosystem(data) {
    const e=data.ecosystem;
    if(!e||!Number.isFinite(Date.parse(e.checked_at))||!Array.isArray(e.groups)||!Array.isArray(e.companies)||!e.companies.length) return false;
    const groups=new Set(e.groups.map(g=>g.id)),ids=new Set();
    const cited=r=>provenance[r.evidence_type]&&r.location&&Array.isArray(r.source_ids)&&r.source_ids.length&&r.source_ids.every(id=>/^https:\/\//.test(data.sources[id]?.url||''));
    for(const c of e.companies) {
      if(ids.has(c.id)||!groups.has(c.group)||!c.period||!c.previous_period||!c.period_end||!c.published_at||!Array.isArray(c.metrics)||!c.metrics.length||!Array.isArray(c.outlook)||!Array.isArray(c.notes)) return false;
      ids.add(c.id);
      const rowIds=new Set();
      for(const r of c.metrics) {
        if(rowIds.has(r.id)||!r.id||!r.label||!partnerUnits[r.unit]||!cited(r)||
          !(Number.isFinite(r.current)||(r.current===null&&r.evidence_type==='unavailable'))||
          !(Number.isFinite(r.previous)||r.previous===null)) return false;
        rowIds.add(r.id);
      }
      const outlookIds=new Set();
      for(const g of c.outlook) {
        if(outlookIds.has(g.id)||!g.id||!cited(g)||!g.period||!g.speaker||!Number.isFinite(Date.parse(g.issued_at))||
          !['公司指引','管理层展望','管理层观察','公司计划'].includes(g.kind)||
          !['numeric','text'].includes(g.type)||(g.type==='numeric'?!g.value:!g.summary)) return false;
        outlookIds.add(g.id);
      }
    }
    return true;
  }
  function freshness(data,now=Date.now()) {
    const updates=typeof module!=='undefined'&&module.exports?require('./update-core.js'):globalThis.MonitorUpdates;
    return updates.warnings(data,now);
  }
  function validate(data) {
    if(data?.schema_version!==2||!Array.isArray(data.metrics)||!data.metrics.length||!data.sources||!data.overview?.fact_cards) return false;
    if(data.monitoring&&(!Array.isArray(data.monitoring.checks)||!Array.isArray(data.monitoring.calendar)))return false;
    if(data.news){
      const n=data.news;
      if(!n.categories||!n.entities||!n.fact_records||!Array.isArray(n.items))return false;
      if(n.items.some(item=>!item||typeof item.id!=='string'||!Array.isArray(item.companies)||!Array.isArray(item.source_ids)||!Array.isArray(item.fact_refs)||typeof item.published_at!=='string'||typeof item.updated_at!=='string'||item.fact_refs.some(ref=>!n.fact_records[ref.record_id]?.payload||!Array.isArray(n.fact_records[ref.record_id]?.context?.sources))))return false;
    }
    if(data.technology){const tech=typeof module!=='undefined'&&module.exports?require('./technology-core.js'):globalThis.MonitorTechnology;if(!tech?.isRenderable(data))return false;}
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
    return validateEcosystem(data)&&data.overview.fact_cards.every(c=>data.metrics.find(m=>m.id===c.metric_id)?.rows.some(r=>c.row_id?r.id===c.row_id:r.label===c.row_label));
  }
  const api={rowChange,freshness,isRenderable:validate,guidanceActuals,guidanceComparison,partnerValue,partnerChange,validateEcosystem,provenance,partnerUnits};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else globalThis.MonitorCore=Object.freeze(api);
})();
