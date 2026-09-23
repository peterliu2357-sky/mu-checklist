(function(){
  'use strict';
  const day=86400000;
  const defaults={industry_discovery_days:4,grace_hours:24,quote_stale_sessions:2};
  // Nasdaq's published 2026 trading calendar; unknown years remain explicitly unknown.
  const holidays={'2026':['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25']};
  function marketDate(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
  function isSession(date){const year=date.slice(0,4);if(!holidays[year])return null;const d=new Date(date+'T12:00:00Z').getUTCDay();return d!==0&&d!==6&&!holidays[year].includes(date.slice(5));}
  function missedSessions(asOf,now){
    if(!Number.isFinite(Date.parse(asOf))||!Number.isFinite(now))return null;
    const today=marketDate(now),last=marketDate(Date.parse(asOf));
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
    if(!Number.isFinite(Date.parse(last)))return null;
    let count=0;
    for(let t=Date.parse(last+'T12:00:00Z')+day;t<=Date.parse(today+'T12:00:00Z');t+=day){
      const key=new Date(t).toISOString().slice(0,10),session=isSession(key);
      if(session===null)return null;
      if(session&&(key!==today||hour>=18))count++;
    }
    return count;
  }
  function states(data,now=Date.now()){
    const policy={...defaults,...data.monitoring?.policy},checks=data.monitoring?.checks||[],calendar=data.monitoring?.calendar||[];
    const companies=[{id:'micron',name:'美光',published_at:data.financial_published_at,checked_at:data.last_successful_check_at},...data.ecosystem.companies];
    const result=[];
    for(const c of companies){
      const key='company:'+c.id,check=checks.find(x=>x.key===key),event=calendar.find(e=>e.company_id===c.id&&e.confirmation==='confirmed'&&e.scheduled_at.slice(0,10)>c.published_at.slice(0,10));
      const checked=check?.checked_at||c.checked_at;
      const item={key,label:c.name,checked_at:checked,check_kind:check?'查新':'原文核查',warning:'',next_event:event||null};
      if(check?.finding==='new_disclosure'&&!check.processed_at)item.warning=`${c.name}发现新披露，待核查录入。`;
      else if(check?.status==='failed'||check?.status==='pending')item.warning=`${c.name}最近一次查新未完成，保留已发布资料。`;
      else if(event&&now>Date.parse(event.review_after))item.warning=`${c.name}已到预计披露时间，待确认新财报。`;
      result.push(item);
    }
    for(const key of ['industry','news']){
      const check=checks.find(c=>c.key===key),label=key==='industry'?'行业资料':'AI 动态';
      const legacy=key==='industry'?data.check_log?.find(c=>['industry','full'].includes(c.scope)&&c.status==='success')?.at:null;
      const checked=check?.checked_at||legacy||null,item={key,label,checked_at:checked,check_kind:'查新',warning:''};
      if(['failed','pending'].includes(check?.status))item.warning=`${label}最近一次查新未完成，保留已保存资料。`;
      else if(checked&&now-Date.parse(checked)>(policy.industry_discovery_days*24+policy.grace_hours)*3600000)item.warning=`${label}查新已逾期，资料日期见各条记录。`;
      result.push(item);
    }
    const missed=missedSessions(data.quote.as_of,now);
    const quoteFailed=data.check_log?.find(c=>['quote','full'].includes(c.scope))?.status==='failed';
    result.push({key:'quote',label:'常规收盘',checked_at:data.quote.checked_at,check_kind:'行情核查',warning:quoteFailed?'常规收盘更新未完成，保留上次行情。':missed!==null&&missed>=policy.quote_stale_sessions?'常规收盘尚未更新到最近交易日，请留意行情日期。':''});
    return result;
  }
  function warnings(data,now=Date.now(),section){
    return states(data,now).filter(s=>section==='ecosystem'?s.key.startsWith('company:')&&s.key!=='company:micron':section==='overview'?['company:micron','quote'].includes(s.key):section==='business'?s.key==='company:micron':section?s.key===section:true).filter(s=>s.warning).map(s=>s.warning);
  }
  function filterNews(data,{category='all',company='all',days=30,now=Date.now()}={}){
    return (data.news?.items||[]).filter(n=>(category==='all'||n.category===category)&&(company==='all'||n.companies.includes(company))&&(days===null||now-Date.parse(n.updated_at)<days*day)).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||a.id.localeCompare(b.id));
  }
  const api={states,warnings,filterNews,marketDate,isSession,missedSessions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.MonitorUpdates=Object.freeze(api);
})();
