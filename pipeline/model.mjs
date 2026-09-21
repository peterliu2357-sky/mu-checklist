import {createHash} from 'node:crypto';

export const clone = value => structuredClone(value);
export const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
export const recordHash = r => hash({metric_id:r.metric_id, definition_version:r.definition_version, context:r.context, payload:r.payload});
export const sourceIdentity = (document, ids) => ids.map(id => ({id, url:document.sources[id]?.url, published_at:document.sources[id]?.published_at}));

// Every financial comparison/outlook has a stable identity independent of its display label.
export function entries(document, catalog) {
  const result=[];
  const add=(metric_id,payload,context,replace) => result.push({metric_id,payload,context,replace});
  for (const m of document.metrics) for (let i=0;i<m.rows.length;i++) {
    const row=m.rows[i];
    const context=m.category==='industry'?{entity:'industry',period:m.period}:{entity:'micron',period:m.period,financial_period:document.financial_period,period_end:document.financial_as_of};
    add(`mu.${m.id}.${row.id}`,row,context,v=>m.rows[i]=v);
  }
  for (let i=0;i<document.guidance.length;i++) {
    const row=document.guidance[i];
    add(`guidance.${row.id}`,row,{entity:'micron',period:row.period,financial_period:document.financial_period},v=>document.guidance[i]=v);
  }
  for (const c of document.ecosystem.companies) {
    for (const type of ['metrics','outlook']) for(let i=0;i<c[type].length;i++) {
      const row=c[type][i];
      add(`${type==='metrics'?'eco':'outlook'}.${c.id}.${row.id}`,row,{entity:c.id,period:c.period,previous_period:c.previous_period,period_end:c.period_end,report_published_at:c.published_at},v=>c[type][i]=v);
    }
  }
  add('quote.mu',document.quote,{entity:'micron',session:document.quote.session},v=>document.quote=v);
  for(let i=0;i<document.events.length;i++) {
    const row=document.events[i];
    add(`event.${row.id}`,row,{entity:'micron'},v=>document.events[i]=v);
  }
  return result;
}

export function makeRecord(entry,document,catalog) {
  const definition=catalog.definitions[entry.metric_id];
  if(!definition) throw new Error(`Unregistered metric: ${entry.metric_id}`);
  const ids=entry.payload.source_ids || (entry.payload.source_id?[entry.payload.source_id]:[]);
  const record={metric_id:entry.metric_id,definition_version:definition.version,
    context:{...entry.context,measurement:definition.measurement,unit:definition.unit,scope:definition.scope,
      accounting_basis:definition.accounting_basis,temporal_basis:definition.temporal_basis,
      sources:sourceIdentity(document,ids)},payload:clone(entry.payload),evidence_ids:[]};
  record.id=recordHash(record);
  return record;
}

export function materialize(ledger) {
  function visit(value) {
    if(Array.isArray(value)) return value.map(visit);
    if(value && typeof value==='object') {
      if(Object.keys(value).length===1 && value.record_ref) {
        const record=ledger.records[value.record_ref];
        if(!record) throw new Error(`Missing record ${value.record_ref}`);
        return clone(record.payload);
      }
      return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)]));
    }
    return value;
  }
  return visit(ledger.document);
}

export function recordDocument(document,catalog,previous=null,evidenceByMetric={}) {
  const ledger={format_version:1,document:clone(document),records:clone(previous?.records||{}),supporting:clone(previous?.supporting||{})};
  for(const entry of entries(ledger.document,catalog)) {
    const record=makeRecord(entry,document,catalog);
    record.evidence_ids=evidenceByMetric[entry.metric_id] || previous?.records[record.id]?.evidence_ids || [];
    ledger.records[record.id]=record;
    entry.replace({record_ref:record.id});
  }
  return ledger;
}

export function activeRecords(ledger) {
  const ids=new Set();
  function walk(v) {
    if(Array.isArray(v)) return v.forEach(walk);
    if(v&&typeof v==='object') {if(v.record_ref)ids.add(v.record_ref);else Object.values(v).forEach(walk);}
  }
  walk(ledger.document);Object.values(ledger.supporting||{}).forEach(id=>ids.add(id));
  return [...ids].map(id=>ledger.records[id]).filter(Boolean);
}

export function compute(op,values) {
  if(values.some(v=>typeof v!=='number'||!Number.isFinite(v))) throw new Error('Formula requires numeric inputs');
  switch(op) {
    case 'sum': return values.reduce((a,b)=>a+b,0);
    case 'difference': return values.slice(1).reduce((a,b)=>a-b,values[0]);
    case 'ratio': case 'ratio_pct':
      if(values[1]===0) throw new Error('Zero denominator');
      return values[0]/values[1]*(op==='ratio_pct'?100:1);
    case 'sum_ratio_pct':
      if(values.at(-1)===0) throw new Error('Zero denominator');
      return values.slice(0,-1).reduce((a,b)=>a+b,0)/values.at(-1)*100;
    case 'net_cash': return values.slice(0,-1).reduce((a,b)=>a+b,0)-values.at(-1);
    default: throw new Error(`Unknown formula ${op}`);
  }
}

export function calculate(document,catalog,supporting={}) {
  const output=clone(document),byId=new Map(entries(output,catalog).map(e=>[e.metric_id,e.payload]));
  for(const [id,payload] of Object.entries(supporting))byId.set(id,payload);
  for(const rule of orderedCalculations(catalog.calculations)) for(const field of ['current','previous']) {
    const target=byId.get(rule.target);
    if(!target) throw new Error(`Missing formula target ${rule.target}`);
    target[field]=compute(rule.op,rule.inputs.map(id=>byId.get(id)?.[field]));
  }
  return output;
}

export function orderedCalculations(rules) {
  const map=new Map(rules.map(r=>[r.target,r])),done=new Set(),visiting=new Set(),ordered=[];
  function visit(id){if(done.has(id))return;if(visiting.has(id))throw new Error(`Formula cycle at ${id}`);const r=map.get(id);if(!r)return;visiting.add(id);r.inputs.forEach(visit);visiting.delete(id);done.add(id);ordered.push(r);}
  rules.forEach(r=>visit(r.target));return ordered;
}
