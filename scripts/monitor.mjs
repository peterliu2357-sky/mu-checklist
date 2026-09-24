#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {updatePlan} from '../pipeline/updates.mjs';
import {clone,hash,stable,materialize,activeRecords,entries,numericInputs} from '../pipeline/model.mjs';
import {validateLedger,validateTransition} from '../pipeline/validate.mjs';
import {createManifest,buildCandidate} from '../pipeline/run.mjs';
import {fetchSource,saveCapture,verifyCaptures} from '../pipeline/acquire.mjs';
import {validateEvolution} from '../pipeline/evolution.mjs';
import {readUpdateStatus} from './update-status.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2),command=args.shift()||'help',flag=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const temp=p+'.tmp';fs.writeFileSync(temp,JSON.stringify(v,null,2)+'\n');fs.renameSync(temp,p);};
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const state=()=>({ledger:read('data/ledger.json'),evidence:read('data/evidence.json'),catalog:read('pipeline/catalog.json'),legacy:read('pipeline/legacy-baseline.json')});
const report=issues=>{console.log(JSON.stringify({ok:issues.length===0,issues},null,2));if(issues.length)process.exitCode=1;};
const runDir=()=>{const value=flag('run');if(!value)throw new Error('--run is required');const p=path.resolve(value);if(!p.startsWith(path.join(root,'.monitor')+path.sep))throw new Error('Runs must live inside .monitor/');return p;};

try {
  if(command==='help')console.log(`mu-checklist data pipeline\n\n  npm ci\n  npm run verify\n  npm test\n  npm run test:ui\n  npm run monitor -- plan --scope full --run .monitor/runs/example\n  npm run monitor -- fetch --run .monitor/runs/example --source SOURCE_ID\n  npm run monitor -- capture --run .monitor/runs/example --source SOURCE_ID --file /path/to/read-source --access full --reviewed\n  npm run monitor -- evidence-draft --run .monitor/runs/example --metric METRIC_ID\n  npm run monitor -- build --run .monitor/runs/example\n  npm run monitor -- status --run .monitor/runs/example\n  npm run monitor -- apply --run .monitor/runs/example\n  npm run monitor -- verify-live --url https://peterliu2357-sky.github.io/mu-checklist/\n\nRead AGENTS.md and docs/PIPELINE.md before a data update. Planning and building never publish.`);
  else if(command==='schedule') {
    const s=state();console.log(JSON.stringify(updatePlan(materialize(s.ledger),s.catalog,{mode:flag('mode','weekly'),company:flag('company'),now:flag('at',new Date().toISOString())}),null,2));
  }
  else if(command==='verify') {
    const {ledger,evidence,catalog,legacy}=state(),issues=validateLedger(ledger,catalog,evidence,legacy),d=materialize(ledger);
    if(stable(d)!==stable(read('data/monitor.json')))issues.push({code:'GENERATED_FILE',path:'data/monitor.json',message:'Published data differs from canonical records'});
    const base=flag('base');
    if(base){
      if(!/^[a-f0-9]{40}$/.test(base))throw new Error('--base must be a full Git commit SHA');
      const previous=JSON.parse(git('show',`${base}:data/monitor.json`));
      const paths=git('ls-tree','-r','--name-only',base).split('\n');
      if(paths.includes('data/ledger.json')){
        const fromBase=p=>JSON.parse(git('show',`${base}:${p}`));
        issues.push(...validateEvolution({oldCatalog:fromBase('pipeline/catalog.json'),catalog,oldLedger:fromBase('data/ledger.json'),ledger,oldEvidence:fromBase('data/evidence.json'),evidence,oldLegacy:fromBase('pipeline/legacy-baseline.json'),legacy}));
      }
      const changed=git('diff','--name-only',base,'HEAD').split('\n');
      for(const p of changed.filter(p=>p.startsWith('data/history/')&&paths.includes(p))){try{const old=git('show',`${base}:${p}`);if(old!==fs.readFileSync(p,'utf8').trim())issues.push({code:'HISTORY',path:p,message:'Historical snapshots are immutable'});}catch(e){if(!fs.existsSync(p))issues.push({code:'HISTORY',path:p,message:'Historical snapshot deleted'});}}
      if(hash(previous)!==hash(d)){
        const receiptPath=`data/releases/${d.revision}.json`;
        if(!fs.existsSync(receiptPath))issues.push({code:'RECEIPT',path:receiptPath,message:'Data changes require a pipeline receipt'});
        else {
          const receipt=read(receiptPath);
          if(receipt.migration){
            const strip=x=>{const v=clone(x);delete v.revision;delete v.updated_at;for(const m of v.metrics)for(const r of m.rows)delete r.id;for(const g of v.guidance){delete g.id;for(const a of g.actuals)delete a.row_id;}for(const c of v.overview.fact_cards)delete c.row_id;for(const e of v.events)delete e.id;return v;};
            if(hash(previous)!==legacy.source_sha256||stable(strip(previous))!==stable(strip(d)))issues.push({code:'MIGRATION',path:'data',message:'Migration must preserve all previously published facts and check dates'});
          }else {
            issues.push(...validateTransition(previous,d,receipt,catalog));
            if(receipt.base_sha256!==hash(previous))issues.push({code:'BASE_CHANGED',path:receiptPath,message:'Release was prepared against a different base snapshot'});
          }
          if(receipt.catalog_sha256!==hash(catalog)||receipt.artifact_sha256!==hash(d)||receipt.ledger_sha256!==hash(ledger)||receipt.evidence_sha256!==hash(evidence))issues.push({code:'RECEIPT_HASH',path:receiptPath,message:'Receipt does not match the verified artifact'});
        }
      }
    }
    report(issues);
  }else if(command==='plan'){
    const dir=runDir();if(fs.existsSync(path.join(dir,'manifest.json')))throw new Error('Run already exists; resume it or choose a new directory');
    const s=state(),d=materialize(s.ledger),at=flag('at',new Date().toISOString());
    const manifest=createManifest({scope:flag('scope','full'),targets:flag('targets')?.split(','),base_commit:git('rev-parse','HEAD'),document:d,catalog:s.catalog,at});
    write(path.join(dir,'manifest.json'),manifest);write(path.join(dir,'proposal.json'),d);write(path.join(dir,'evidence.json'),{});
    write(path.join(dir,'supporting.json'),Object.fromEntries(Object.entries(s.ledger.supporting).map(([id,ref])=>[id,s.ledger.records[ref].payload])));
    console.log(JSON.stringify({run:dir,scope:manifest.scope,coverage:manifest.coverage.map(c=>c.key),next:'Read sources, complete evidence.json and manifest.json, then build.'},null,2));
  }else if(['fetch','capture'].includes(command)){
    const dir=runDir(),manifest=read(path.join(dir,'manifest.json')),proposal=read(path.join(dir,'proposal.json')),id=flag('source'),source=proposal.sources[id];
    if(!source)throw new Error('Unknown source; register it in the candidate and catalog first');
    const at=new Date().toISOString();
    try{
      const bytes=command==='fetch'?(await fetchSource(source.url)).bytes:fs.readFileSync(flag('file'));
      const capture=await saveCapture(dir,{source_id:id,url:source.url,bytes,access:flag('access','full'),at,reviewed:args.includes('--reviewed'),format:command==='fetch'?'source_bytes':flag('format','research_export')});
      manifest.reads=manifest.reads.filter(r=>r.source_id!==id);manifest.reads.push(capture);manifest.state='collecting';write(path.join(dir,'manifest.json'),manifest);console.log(JSON.stringify(capture,null,2));
    }catch(error){manifest.state='partial';manifest.reads.push({source_id:id,url:source.url,status:'failed',attempted_at:at,error:error.message});write(path.join(dir,'manifest.json'),manifest);throw error;}
  }else if(command==='evidence-draft'){
    const dir=runDir(),metric=flag('metric'),s=state(),proposal=read(path.join(dir,'proposal.json')),manifest=read(path.join(dir,'manifest.json'));
    const row=entries(proposal,s.catalog).find(x=>x.metric_id===metric)?.payload||read(path.join(dir,'supporting.json'))[metric],def=s.catalog.definitions[metric];
    if(!row||!def)throw new Error('Unknown metric identity');
    const output=read(path.join(dir,'evidence.json'));if(output[metric])throw new Error('Evidence draft already exists; edit it without overwriting completed work');
    const ids=row.source_ids||(row.source_id?[row.source_id]:[]);
    output[metric]={measurement:def.measurement,unit:def.unit,definition_version:def.version,temporal_basis:def.temporal_basis,accounting_basis:def.accounting_basis,scope:def.scope,
      values:{current:row.current??null,previous:row.previous??null,value:row.value??null,summary:row.summary??null},
      raw_inputs:numericInputs(row).map(({field,source_ids})=>({field,value:null,scale:null,source_unit:'',period:'',locator:'',source_id:source_ids?.[0]||ids[0]})),
      review:{confirmed:false,method:'',at:null},documents:ids.map(source_id=>({...manifest.reads.find(r=>r.source_id===source_id),source_id,locator:'',excerpt:''}))};
    write(path.join(dir,'evidence.json'),output);console.log('Draft created. Fill original inputs, locators and excerpts; confirm only after reading the source.');
  }else if(command==='build'){
    const dir=runDir(),s=state(),manifest=read(path.join(dir,'manifest.json'));
    manifest.completed_at=manifest.completed_at||flag('at',new Date().toISOString());
    const result=buildCandidate({previousLedger:s.ledger,previousEvidence:s.evidence,proposal:read(path.join(dir,'proposal.json')),supporting:read(path.join(dir,'supporting.json')),evidenceInput:read(path.join(dir,'evidence.json')),manifest,catalog:s.catalog,legacy:s.legacy});
    result.issues.push(...await verifyCaptures(dir,manifest.reads.filter(r=>r.status!=='failed')));
    result.receipt.state=result.issues.length?'blocked':'verified';
    for(const [name,value]of Object.entries({candidate:result.document,ledger:result.ledger,evidence:result.evidence,receipt:result.receipt,report:{ok:!result.issues.length,issues:result.issues}}))write(path.join(dir,'build',name+'.json'),value);
    manifest.state=result.receipt.state;write(path.join(dir,'manifest.json'),manifest);report(result.issues);
  }else if(command==='status'){
    const dir=runDir();console.log(JSON.stringify(read(path.join(dir,'manifest.json')),null,2));
    if(fs.existsSync(path.join(dir,'build/report.json')))console.log(JSON.stringify(read(path.join(dir,'build/report.json')),null,2));
  }else if(command==='apply'){
    const dir=runDir(),receipt=read(path.join(dir,'build/receipt.json')),candidate=read(path.join(dir,'build/candidate.json')),ledger=read(path.join(dir,'build/ledger.json')),evidence=read(path.join(dir,'build/evidence.json')),s=state(),old=materialize(s.ledger);
    if(git('rev-parse','HEAD')!==receipt.base_commit||hash(old)!==receipt.base_sha256)throw new Error('BASE_CHANGED: refresh main and rebuild; never overwrite concurrent changes');
    if(receipt.catalog_sha256!==hash(s.catalog))throw new Error('CATALOG_CHANGED: rebuild against the current metric definitions');
    if(receipt.state!=='verified'||hash(candidate)!==receipt.artifact_sha256||hash(ledger)!==receipt.ledger_sha256||hash(evidence)!==receipt.evidence_sha256)throw new Error('Candidate differs from the verified artifact');
    const issues=[...validateEvolution({oldCatalog:s.catalog,catalog:s.catalog,oldLedger:s.ledger,ledger,oldEvidence:s.evidence,evidence,oldLegacy:s.legacy,legacy:s.legacy}),...validateLedger(ledger,s.catalog,evidence,s.legacy),...validateTransition(old,candidate,receipt,s.catalog),...await verifyCaptures(dir,receipt.reads.filter(r=>r.status!=='failed'))];
    if(stable(materialize(ledger))!==stable(candidate))issues.push({code:'GENERATED_FILE',path:'candidate',message:'Candidate differs from its canonical records'});
    if(issues.length){report(issues);}else{
      const archive=`data/history/${old.revision}.json`;
      if(fs.existsSync(archive)&&hash(read(archive))!==hash(old))throw new Error('HISTORY_CONFLICT: existing snapshot differs');
      if(!fs.existsSync(archive))write(archive,old);
      write('data/ledger.json',ledger);write('data/evidence.json',evidence);write('data/monitor.json',candidate);write(`data/releases/${candidate.revision}.json`,receipt);
      console.log(`Prepared ${candidate.revision}. Run tests, commit these files together, and push without force. No remote changes made.`);
    }
  }else if(command==='verify-live'){
    const base=flag('url');if(!base?.startsWith('https://'))throw new Error('--url must be the HTTPS site URL');
    const expected=read('data/monitor.json'),status=readUpdateStatus(expected);
    const get=async file=>{const response=await fetch(new URL(`${file}?revision=${encodeURIComponent(expected.revision)}`,base),{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok)throw new Error(`Live ${file} HTTP ${response.status}`);return response.json();};
    const [live,liveStatus,release]=await Promise.all([get('data/monitor.json'),get('data/update-status.json'),get('release.json')]);
    if(hash(live)!==hash(expected))throw new Error(`Live data mismatch: ${live.revision}`);
    if(hash(liveStatus)!==hash(status)||liveStatus.data_revision!==live.revision)throw new Error('Live update schedule or check times mismatch');
    if(release.data_sha256!==hash(expected)||release.update_status_sha256!==hash(status))throw new Error('Live release manifest mismatch');
    console.log(`Verified live revision ${live.revision}, data hash, update times, and schedule.`);
  }else throw new Error(`Unknown command ${command}`);
}catch(error){console.error(error.message);process.exitCode=1;}
