import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fetchSource,saveCapture} from '../pipeline/acquire.mjs';
import {quoteURL,parseRegularClose} from '../pipeline/quote-adapter.mjs';
import market from '../lib/update-core.js';

const read=p=>JSON.parse(fs.readFileSync(p)),write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const cli=(...args)=>execFileSync(process.execPath,['scripts/monitor.mjs',...args],{stdio:'inherit'});
const now=new Date(),date=market.marketDate(now.getTime()),session=market.isSession(date);
if(session===false){console.log('Market holiday/weekend; no research or data changes.');process.exit(0);}
if(session===null)throw new Error('Exchange calendar needs an original-source update before automated quotes resume');
const dir='.monitor/runs/quote-'+now.toISOString().replace(/[:.]/g,'-');
cli('plan','--scope','quote','--run',dir);
const proposal=read(dir+'/proposal.json'),manifest=read(dir+'/manifest.json'),evidence={},sid='price_auto';
try{
  const {bytes}=await fetchSource(quoteURL),payload=JSON.parse(bytes.toString()),quote=parseRegularClose(payload,{now:Date.now(),previousAsOf:proposal.quote.as_of});
  if(Date.parse(quote.as_of)<=Date.parse(proposal.quote.as_of)){console.log('No new completed session; existing quote retained.');process.exit(0);}
  const at=new Date().toISOString(),receipt=await saveCapture(dir,{source_id:sid,url:quoteURL,bytes,access:'full',at,reviewed:true,format:'source_bytes'});
  manifest.reads=[receipt];manifest.publication_corrections=[sid];
  proposal.sources[sid]={label:'Yahoo Finance MU 常规交易日线',short_label:'MU 历史行情',url:quoteURL,locator:'chart.result[0] · timestamp / indicators.quote[0].close；最近两个已完成交易日。',published_at:quote.date,checked_at:at.slice(0,10),type:'行情供应商结构化数据'};
  proposal.quote={price:quote.price,previous_close:quote.previous_close,as_of:quote.as_of,session:'regular_close',source_id:sid,checked_at:at};
  const definition=read('pipeline/catalog.json').definitions['quote.mu'];
  evidence['quote.mu']={measurement:definition.measurement,unit:definition.unit,definition_version:definition.version,temporal_basis:definition.temporal_basis,accounting_basis:definition.accounting_basis,scope:definition.scope,values:{current:null,previous:null,value:null,summary:null},raw_inputs:[{field:'price',value:quote.price,scale:1,source_unit:'USD',period:quote.date,locator:'indicators.quote[0].close · latest completed daily timestamp',source_id:sid},{field:'previous_close',value:quote.previous_close,scale:1,source_unit:'USD',period:quote.previous_date,locator:'indicators.quote[0].close · previous daily timestamp',source_id:sid}],review:{confirmed:true,method:'Tested structured OHLC adapter: identity, currency, completed session, previous bar and split checks',at},documents:[{...receipt,locator:proposal.sources[sid].locator,excerpt:JSON.stringify({symbol:'MU',date:quote.date,close:quote.price,previous_date:quote.previous_date,previous_close:quote.previous_close})}]};
  manifest.coverage=[{key:'quote',status:'verified',evidence:[sid],reviewed_at:at,latest_disclosure:{url:quoteURL,published_at:quote.date},reason:'Validated final regular-session daily OHLC data.'}];manifest.summary=`更新 MU ${quote.date} 常规收盘；财报与新闻核查时间保持不变。`;
}catch(error){
  // An access/parsing failure is a publishable failure receipt, never a new price.
  manifest.reads=[{source_id:sid,url:quoteURL,status:'failed',attempted_at:new Date().toISOString(),error:error.message}];
  manifest.coverage=[{key:'quote',status:'failed',evidence:[],reviewed_at:null,latest_disclosure:null,reason:error.message}];manifest.summary='常规收盘更新未完成，保留上次行情。';
}
write(dir+'/proposal.json',proposal);write(dir+'/manifest.json',manifest);write(dir+'/evidence.json',evidence);
cli('build','--run',dir);cli('apply','--run',dir);
