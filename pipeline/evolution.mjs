import {stable,hash} from './model.mjs';

export function validateEvolution({oldCatalog,catalog,oldLedger,ledger,oldEvidence,evidence,oldLegacy,legacy}) {
  const issues=[],add=(code,path,message)=>issues.push({code,path,message});
  if(stable(oldLegacy)!==stable(legacy))add('LEGACY_IMMUTABLE','pipeline/legacy-baseline.json','The migration exemption cannot be enlarged during routine updates');
  for(const [id,record]of Object.entries(oldLedger.records)){
    const next=ledger.records[id];
    if(!next||stable({...record,evidence_ids:[]})!==stable({...next,evidence_ids:[]}))add('RECORD_HISTORY',id,'Prior records must be retained unchanged');
    else if(record.evidence_ids.some(id=>!next.evidence_ids.includes(id)))add('EVIDENCE_HISTORY',id,'Existing evidence links must be retained');
  }
  for(const [id,record]of Object.entries(oldEvidence))if(!evidence[id]||hash(record)!==hash(evidence[id]))add('EVIDENCE_HISTORY',id,'Prior source evidence cannot be removed or overwritten');
  const semantic=['measurement','unit','scope','accounting_basis','temporal_basis','nature','entity'];
  for(const [id,definition]of Object.entries(oldCatalog.definitions)){
    const next=catalog.definitions[id];
    if(!next){add('DEFINITION_HISTORY',id,'Retire definitions with active=false rather than deleting their identity');continue;}
    if(semantic.some(k=>stable(definition[k])!==stable(next[k]))&&next.version<=definition.version)add('DEFINITION_VERSION',id,'Changed economic meaning requires a higher definition version');
    if(next.version<definition.version)add('DEFINITION_VERSION',id,'Definition versions cannot go backwards');
  }
  return issues;
}
