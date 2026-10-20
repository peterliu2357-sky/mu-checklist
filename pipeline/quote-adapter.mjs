import market from '../lib/update-core.js';

// Yahoo's daily OHLC close, never adjclose or a post-market snapshot.
export const quoteURL='https://query1.finance.yahoo.com/v8/finance/chart/MU?range=1mo&interval=1d&events=splits';
// The regular close in New York time on a past session date, for bars outside currentTradingPeriod.
function closeInstant(date){const hour=market.closeHour(date),t=Date.parse(date+'T'+String(hour+4).padStart(2,'0')+':00:00Z');return Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(t)))===hour?t:t+3600000;}
export function parseRegularClose(payload,{now=Date.now(),previousAsOf}={}){
  if(payload.chart?.error)throw new Error('Quote provider returned an error');
  const result=payload.chart?.result?.[0],meta=result?.meta,period=meta?.currentTradingPeriod?.regular;
  if(meta?.symbol!=='MU'||meta.currency!=='USD'||meta.exchangeTimezoneName!=='America/New_York'||!period?.end||!period?.start)throw new Error('Unexpected quote symbol, currency, timezone or session');
  // The latest completed session: an earlier market date, or today once its close has
  // cleared the one-hour buffer. Yahoo can append today's bar hours after the close, so
  // an absent bar falls back to the last finished one and a later run picks today up.
  const today=market.marketDate(now),periodDate=market.marketDate(period.end*1000),todayFinal=periodDate===today&&now>=period.end*1000+3600000;
  const quotes=result.indicators?.quote?.[0],bars=(result.timestamp||[]).map((at,i)=>({at:at*1000,close:quotes?.close?.[i],high:quotes?.high?.[i],low:quotes?.low?.[i]})).filter(b=>Number.isFinite(b.close)&&(market.marketDate(b.at)<today||todayFinal&&market.marketDate(b.at)===today));
  if(bars.length<2)throw new Error('Two comparable completed daily closes are required');
  const last=bars.at(-1),prior=bars.at(-2),sessionDate=market.marketDate(last.at);
  if(market.isSession(sessionDate)!==true)throw new Error('Trading session is not confirmed by the maintained calendar');
  if(![last.at,prior.at,last.low,last.high,prior.low,prior.high].every(Number.isFinite)||last.at<=prior.at||market.marketDate(last.at)===market.marketDate(prior.at)||last.close<=0||prior.close<=0||last.close<last.low||last.close>last.high||prior.close<prior.low||prior.close>prior.high)throw new Error('Invalid daily OHLC comparison');
  let previousDay=Date.parse(sessionDate+'T12:00:00Z')-86400000;
  while(market.isSession(new Date(previousDay).toISOString().slice(0,10))===false)previousDay-=86400000;
  const expectedPrevious=new Date(previousDay).toISOString().slice(0,10);
  if(market.isSession(expectedPrevious)!==true||market.marketDate(prior.at)!==expectedPrevious)throw new Error('Previous daily bar is not the preceding confirmed trading session');
  if(Object.values(result.events?.splits||{}).some(e=>e.date*1000>Date.parse(previousAsOf||'1970-01-01')))throw new Error('Stock split requires a reviewed normalization update');
  return {price:last.close,previous_close:prior.close,as_of:new Date(sessionDate===periodDate?period.end*1000:closeInstant(sessionDate)).toISOString(),previous_date:market.marketDate(prior.at),date:sessionDate,raw_positions:{current:bars.length-1,previous:bars.length-2}};
}
