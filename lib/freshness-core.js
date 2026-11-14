/* Row freshness: how old a dated row may get before a routine check has to resolve it. The pipeline, the scheduler and the page share these rules. */
(function () {
  'use strict';
  const day=86400000;
  const isDate=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'');
  const monthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  // The date a row's reading describes: its own as_of (a month counts to its last day), else its newest source's publication date.
  function dataDate(row,sources) {
    if(row.as_of) return row.as_of.length===7?monthEnd(row.as_of):row.as_of;
    return (row.source_ids||[]).map(id=>sources?.[id]?.published_at).filter(isDate).map(d=>d.slice(0,10)).sort().at(-1)||null;
  }
  const rowId=(metric,row)=>`mu.${metric.id}.${row.id}`;
  const hasReading=row=>row.evidence_type!=='unavailable';
  // Rows that must carry a limit: every reading on an industry card, and any company-card reading whose newest source predates the current report.
  function needsLimit(document,metric,row) {
    if(!hasReading(row)) return false;
    if(metric.category==='industry') return true;
    const date=dataDate(row,document.sources);
    return !row.as_of&&date!==null&&date<String(document.financial_published_at).slice(0,10);
  }
  function tracked(document,config) {
    const limits=config?.rows||{};
    return document.metrics.flatMap(metric=>metric.rows.filter(row=>hasReading(row)&&limits[rowId(metric,row)]!=null).map(row=>({metric_id:rowId(metric,row),metric,row,limit_days:limits[rowId(metric,row)]})));
  }
  // fresh: within its limit. confirmed: past the limit, but a recent check found nothing newer at the source.
  // pending: a check found newer data that is not entered yet. overdue: past the limit with no recent check.
  function status(row,{sources,limit_days,review,review_valid_days,now}) {
    const date=dataDate(row,sources),limitEnds=date?Date.parse(date+'T00:00:00Z')+(limit_days+1)*day:-Infinity;
    const applies=review&&review.data_date===date&&Date.parse(review.reviewed_at)<=now?review:null;
    const base={date,limit_days,age_days:date?Math.floor((now-Date.parse(date+'T00:00:00Z'))/day):null,review:applies};
    if(applies?.finding==='newer_found') return {...base,state:'pending',overdue_days:0};
    if(now<limitEnds) return {...base,state:'fresh',overdue_days:0};
    const coveredUntil=applies?Date.parse(applies.reviewed_at)+review_valid_days*day:limitEnds;
    return now<coveredUntil?{...base,state:'confirmed',overdue_days:0}:{...base,state:'overdue',overdue_days:Math.floor((now-Math.max(limitEnds,coveredUntil))/day)};
  }
  function report(document,config,now) {
    const reviews=new Map((document.monitoring?.row_reviews||[]).map(r=>[r.metric_id,r]));
    return tracked(document,config).map(({metric_id,metric,row,limit_days})=>({metric_id,card:metric.id,label:row.label,...status(row,{sources:document.sources,limit_days,review:reviews.get(metric_id),review_valid_days:config.review_valid_days,now})}));
  }
  // Earliest and latest data dates among a card's readings, for its header.
  function span(metric,sources) {
    const dates=metric.rows.filter(hasReading).map(row=>dataDate(row,sources)).filter(Boolean).sort();
    return dates.length?{from:dates[0],to:dates.at(-1)}:null;
  }
  const api={dataDate,rowId,needsLimit,tracked,status,report,span};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else globalThis.MonitorFreshness=Object.freeze(api);
})();
