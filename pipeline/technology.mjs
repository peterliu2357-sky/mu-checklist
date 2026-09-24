import {stable} from './model.mjs';

export const technologyTargets=catalog=>Object.keys(catalog.monitoring.targets).filter(k=>k.startsWith('technology:'));
export const targetFor=item=>'technology:'+({facility:'facilities',process:'processes',product:'products'})[item.type];
export function technologyReviews(document,companies=[]){
  return (document.technology?.items||[]).filter(i=>companies.includes(i.company_id)).map(i=>({id:i.id,status:'pending',evidence:[],reason:''}));
}

export function validateTechnology(d,catalog){
  const issues=[],add=(code,path,message)=>issues.push({code,path,message}),items=d.technology?.items||[];
  for(const i of items){
    const path='tech.'+i.id,definition=catalog.definitions[path],registry=catalog.technology?.items[i.id];
    if(!registry||['type','company_id','family','role'].some(k=>registry[k]!==i[k])||definition?.monitoring_target!==targetFor(i))add('TECH_REGISTRY',path,'Identity, manufacturing role and comparison family must match the catalog');
    if(!Number.isFinite(Date.parse(i.as_of))||Date.parse(i.as_of)>Date.parse(d.updated_at))add('TECH_DATE',path,'Use a valid disclosure date, not a future milestone');
    const supportsDate=(s,at)=>i.date_basis==='page_checked'?d.sources[s]?.published_at===null&&d.sources[s]?.checked_at>=at:d.sources[s]?.published_at===at;
    if(!i.source_ids.some(s=>supportsDate(s,i.as_of)))add('TECH_DATE',path,'Date must be supported by a dated source or explicitly labeled product-page check');
    const seen=new Set();
    for(const f of i.facts){
      if(seen.has(f.id))add('TECH_FACT',path,'Duplicate fact identity');seen.add(f.id);
      if(f.source_ids.some(s=>!i.source_ids.includes(s)))add('TECH_SOURCE',path,'Each field must point to one of this record’s captured sources');
      if((f.value===null)!==(f.nature==='unavailable'))add('TECH_GAP',path+'.'+f.id,'Missing values must remain explicit gaps');
      if(!Number.isFinite(Date.parse(f.as_of))||Date.parse(f.as_of)>Date.parse(i.as_of)||!f.source_ids.some(s=>supportsDate(s,f.as_of)))add('TECH_DATE',path+'.'+f.id,'Each field retains its own supported disclosure date');
      if(f.nature==='vendor_claim'&&!f.baseline) add('TECH_BASELINE',path+'.'+f.id,'Vendor comparisons need the original baseline');
      const units=catalog.technology?.fact_units[f.id];
      if(units&&!units.includes(f.unit))add('TECH_UNIT',path+'.'+f.id,'Use the registered measurement unit');
    }
    for(const key of registry?.required_facts||[])if(!seen.has(key))add('TECH_COVERAGE',path+'.'+key,'Required observation must be present, including explicit gaps');
    if(i.type==='facility'){
      const capacity=i.facts.find(f=>f.id==='capacity');
      const expected={wafer_fab:'wafers/month',assembly_test:'chips/year',advanced_packaging:'stacks/month'}[i.role];
      if(capacity?.unit!==expected)add('TECH_CAPACITY_BASIS',path,'Capacity unit must describe this manufacturing stage');
    }
    if(i.type==='process'&&i.facts.some(f=>f.id==='bit_density'&&f.unit!=='bits/wafer_pct'))add('TECH_DENSITY',path,'Bits per wafer are a node-level measurement');
    if(i.type==='product'&&i.facts.find(f=>f.id==='capacity')?.unit!=='GB')add('TECH_CAPACITY_BASIS',path,'Product capacity is GB per module or stack');
    if(i.type==='product'&&i.power_test?.metric==='operating_power_w'&&i.facts.find(f=>f.id==='power')?.unit!=='W')add('TECH_POWER',path,'Absolute power must be recorded in watts');
  }
  for(const id of d.technology?.highlights||[])if(!items.some(i=>i.id===id))add('TECH_REFERENCE',id,'Highlight must reference an existing canonical item');
  for(const n of d.news?.items||[])for(const id of n.technology_refs||[])if(!items.some(i=>i.id===id))add('TECH_REFERENCE',n.id,'News links must resolve to an existing technology item');
  return issues;
}

export function validateTechnologyTransition(previous,next,run,catalog){
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  const accepted=c=>c&&['verified','unchanged','gap'].includes(c.status);
  // A technology import can retire former display rows through explicit catalog replacements.
  // It cannot refresh or alter unrelated quarterly observations.
  const techOnly=run.scope==='technology'||run.scope.startsWith('technology:')||run.scope==='batch'&&run.targets.every(k=>k.startsWith('technology:')||k==='news');
  if(techOnly){
    for(const key of ['guidance','ecosystem','quote','financial_period','financial_as_of','financial_published_at','overview'])if(stable(previous[key])!==stable(next[key]))add('UNRELATED_FACT_CHANGE',key,'A technology run preserves unrelated financial facts and dates');
    const expected=structuredClone(previous.metrics);
    for(const m of expected)m.rows=m.rows.filter(r=>{const def=catalog.definitions[`mu.${m.id}.${r.id}`];return !(def&&!def.active&&def.replacement&&next.technology?.items.some(i=>'tech.'+i.id===def.replacement));});
    if(stable(expected)!==stable(next.metrics))add('UNRELATED_FACT_CHANGE','metrics','Only explicitly replaced technical rows may be retired during a technology import');
  }
  for(const item of next.technology?.items||[]){
    const old=previous.technology?.items.find(i=>i.id===item.id);
    if(stable(old)===stable(item))continue;
    const key=targetFor(item),coverage=run.coverage?.find(c=>c.key===key);
    if(!accepted(coverage))add('TECH_COVERAGE',item.id,'Changed technology needs successful topic coverage');
  }
  for(const old of previous.technology?.items||[])if(!next.technology?.items.some(i=>i.id===old.id)&&catalog.definitions['tech.'+old.id]?.active)add('TECH_HISTORY',old.id,'Retire an item explicitly; retain its historical records');
  for(const company of run.report_bundle||[])for(const item of next.technology?.items.filter(i=>i.company_id===company)||[]){
    const review=run.technology_reviews?.find(r=>r.id===item.id);
    if(!review||!['unchanged','updated','gap'].includes(review.status)||!review.reason||!review.evidence?.length||!review.evidence.every(s=>run.reads?.some(r=>r.source_id===s&&r.status==='read'&&r.reviewed_at)))add('TECH_REPORT_REVIEW',item.id,'A new report must review each tracked facility/process/product, preserving prior facts if the report gives no update');
  }
  if(run.scope==='discovery')for(const c of run.coverage||[]){
    if(!c.key.startsWith('technology:')||!accepted(c))continue;
    const normalize=url=>url?.replace(/\/$/,'');
    for(const url of catalog.monitoring.targets[c.key].entry_urls){
      if(!c.evidence?.some(id=>run.reads?.some(r=>r.source_id===id&&r.status==='read'&&r.reviewed_at&&normalize(r.url)===normalize(url))))add('TECH_DISCOVERY_COVERAGE',c.key,'Successful topic discovery requires every registered official entry source');
    }
  }
  return issues;
}
