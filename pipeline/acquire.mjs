import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourceUrl(value) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.includes(':'))throw new Error('Only public HTTPS source URLs are allowed');
  return u;
}
export async function fetchSource(url,{fetcher=fetch,timeout=20000}={}) {
  const u=sourceUrl(url);
  const response=await fetcher(u,{signal:AbortSignal.timeout(timeout),redirect:'error',headers:{'User-Agent':'mu-checklist source audit (public investor documents)'}});
  if(!response.ok)throw new Error(`Source HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>30*1024*1024)throw new Error('Source is larger than 30 MB; capture the relevant source through the research adapter');
  return {bytes,sha256:bytesHash(bytes),content_type:response.headers.get('content-type')||'application/octet-stream'};
}
export async function saveCapture(runDir,{source_id,url,bytes,access='full',at,reviewed=false,format='research_export'}) {
  sourceUrl(url);
  if(!['full','abstract','secondary'].includes(access))throw new Error('Access must be full, abstract or secondary');
  const sha256=bytesHash(bytes),dir=path.join(runDir,'captures');await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,sha256),bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  return {source_id,url,sha256,access,capture_format:format,accessed_at:at,reviewed_at:reviewed?at:null,status:reviewed?'read':'fetched'};
}
export async function verifyCaptures(runDir,reads) {
  const issues=[];
  for(const r of reads){try{
    if(!/^[a-f0-9]{64}$/.test(r.sha256||''))throw new Error('Missing source content hash');
    const bytes=await fs.readFile(path.join(runDir,'captures',r.sha256));if(bytesHash(bytes)!==r.sha256)throw new Error('Captured source content changed');
  }catch(error){issues.push({code:'CAPTURE',path:r.source_id,message:error.message});}}
  return issues;
}
