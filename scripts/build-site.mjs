import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {materialize,hash} from '../pipeline/model.mjs';
import {validateLedger} from '../pipeline/validate.mjs';
import {readUpdateStatus} from './update-status.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const ledger=read('data/ledger.json'),d=materialize(ledger),issues=validateLedger(ledger,read('pipeline/catalog.json'),read('data/evidence.json'),read('pipeline/legacy-baseline.json'));
if(issues.length)throw new Error(JSON.stringify(issues));
if(hash(read('data/monitor.json'))!==hash(d))throw new Error('Generated monitor.json is out of sync');
const updateStatus=readUpdateStatus(d);
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/data',{recursive:true});
for(const dir of ['assets','lib'])fs.cpSync(dir,path.join('dist',dir),{recursive:true});
for(const name of ['index.html','preview.html']){
  let html=fs.readFileSync(name,'utf8').replace(/(<script type="application\/json" id="fallback-data">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(d).replace(/</g,'\\u003c')+b);
  html=html.replace('<script type="application/json" id="fallback-update-status">null</script>','<script type="application/json" id="fallback-update-status">'+JSON.stringify(updateStatus).replace(/</g,'\\u003c')+'</script>');
  html=html.replace(/((?:src|href)="([^"?]+))\?v=[^" ]+/g,(match,prefix,file)=>fs.existsSync(file)?prefix+'?v='+hash(fs.readFileSync(file,'utf8')).slice(0,12):match);
  fs.writeFileSync(path.join('dist',name),html);
}
fs.copyFileSync('data/monitor.json','dist/data/monitor.json');
fs.writeFileSync('dist/data/update-status.json',JSON.stringify(updateStatus,null,2)+'\n');
fs.cpSync('data/history','dist/data/history',{recursive:true});
fs.writeFileSync('dist/.nojekyll','');
let commit=process.env.GITHUB_SHA;try{commit||=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{commit='local';}
fs.writeFileSync('dist/release.json',JSON.stringify({schema_version:2,data_revision:d.revision,data_sha256:hash(d),update_status_sha256:hash(updateStatus),ui_commit:commit},null,2)+'\n');
console.log(`Built site with ${d.revision}; private research captures are excluded.`);
