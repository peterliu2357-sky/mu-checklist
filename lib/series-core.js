/* Series points: the past readings behind a metric's trend line. The pipeline and the page share these rules. */
(function () {
  'use strict';
  // Micron quarters are keyed by financial period; industry readings by the date (YYYY-MM-DD) or month (YYYY-MM) they describe.
  const isQuarter=key=>/^FY\d{4} Q[1-4]$/.test(key||'');
  const isObservationDate=key=>/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(key||'');
  const key=point=>point.financial_period||point.as_of;
  // Dated readings compare only within one format, so a monthly series never mixes with a daily one; null when they cannot be compared.
  const compareDates=(a,b)=>isObservationDate(a)&&isObservationDate(b)&&a.length===b.length?(a<b?-1:a>b?1:0):null;
  // Points a trend line shows, live reading included.
  const windows=Object.freeze({quarter:8,observation:16});
  const label=k=>isObservationDate(k)&&k.length===10?k.slice(5):k;

  // A trend line: past points oldest first, then the live reading from its row, so each number is stored once.
  // live is {value, financial_period} for a Micron quarter or {value, as_of} for an industry reading.
  function trend(past,live) {
    if(!past?.length||typeof live.value!=='number') return [];
    const quarterly=isQuarter(key(past[0]));
    const now=quarterly?live.financial_period:live.as_of?label(live.as_of):'最新';
    return [...past.map(p=>({period:label(key(p)),value:p.value})),{period:now,value:live.value}].slice(-(quarterly?windows.quarter:windows.observation));
  }

  const api={isQuarter,isObservationDate,key,compareDates,windows,trend};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.MonitorSeries=Object.freeze(api);
})();
