import {createRequire} from 'node:module';
import {entries} from './model.mjs';

const core=createRequire(import.meta.url)('../lib/outlook-core.js');
export const {validate:validateOutlook,resolve:resolveOutlookRef,format:formatOutlookValue,citedRefs,snapshot:outlookSnapshot}=core;

// Every fact a writer may cite: live rows, guidance, partner results and outlook, plus past series points.
export function outlookContext(document,catalog) {
  const ids=entries(document,catalog).map(e=>e.metric_id).filter(id=>/^(mu|guidance|eco|outlook)\./.test(id));
  for(const [metric,points]of Object.entries(document.series||{}))for(const p of points)ids.push(`series.${metric}@${p.financial_period||p.as_of}`);
  return ids.map(id=>{const item=core.resolve(document,id);return item&&{ref:id,label:item.label,period:item.period,current:item.display||core.format(item.current,item.unit),previous:item.previous==null?null:core.format(item.previous,item.unit),change:item.change||null};}).filter(Boolean);
}

// Records the cited values the analysis was written against, so later data changes force a re-read.
export function stampOutlook(outlook,document,at) {
  const cited={};
  for(const ref of core.citedRefs(outlook)){const item=core.resolve(document,ref);if(item)cited[ref]=core.snapshot(item);}
  return {...outlook,generated_at:at,data_revision:document.revision,financial_period:document.financial_period,cited};
}
