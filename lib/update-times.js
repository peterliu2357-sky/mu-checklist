(function(){
  'use strict';
  const updates=typeof module!=='undefined'&&module.exports?require('./update-core.js'):globalThis.MonitorUpdates;
  const day=86400000,zone='America/Los_Angeles';
  const instant=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
  function parts(time,timeZone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
  function localDate(time,timeZone){const p=parts(time,timeZone);return `${p.year}-${p.month}-${p.day}`;}
  function wallTime(date,hour,minute,timeZone){
    const wanted=Date.parse(`${date}T00:00:00Z`)+hour*3600000+minute*60000;let result=wanted;
    for(let i=0;i<3;i++){const p=parts(result,timeZone),shown=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);result+=wanted-shown;}
    return new Date(result).toISOString();
  }
  function format(value,short=false){
    if(!value)return '暂无记录';
    if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value+'（仅日期）';
    if(!instant(value))return '时间待确认';
    const p=parts(Date.parse(value),zone);return `${short?'':p.year+'-'}${p.month}${short?'/':'-'}${p.day} ${p.hour}:${p.minute}${short?' PT':''}`;
  }
  function occurrences(plan,now,trading=false){
    if(!plan?.enabled)return {next_at:null,previous_at:null,unknown_calendar:false};
    const today=localDate(now,plan.timezone),start=Date.parse(today+'T12:00:00Z'),candidates=[];let unknown=false;
    for(let delta=-10;delta<=14;delta++){
      const date=new Date(start+delta*day).toISOString().slice(0,10),weekday=new Date(date+'T12:00:00Z').getUTCDay();
      if(!plan.weekdays.includes(weekday))continue;
      const at=wallTime(date,plan.hour,plan.minute,plan.timezone);
      if(Date.parse(at)<Date.parse(plan.starts_at))continue;
      if(trading){const session=updates.isSession(date);if(session===null&&Date.parse(at)>=now)unknown=true;if(session!==true)continue;}
      candidates.push(at);
    }
    return {next_at:candidates.find(at=>Date.parse(at)>=now)||null,previous_at:candidates.filter(at=>Date.parse(at)<now).at(-1)||null,unknown_calendar:unknown&&!candidates.some(at=>Date.parse(at)>=now)};
  }
  function matches(document,status){
    if(status?.version!==1||status.data_revision!==document.revision||!status.checks||typeof status.checks!=='object'||!status.schedule)return false;
    try{
      const s=status.schedule;
      for(const key of ['research','quote']){const p=s[key];if(typeof p?.enabled!=='boolean'||!Array.isArray(p.weekdays)||!p.weekdays.length||!instant(p.starts_at)||!Number.isInteger(p.hour)||p.hour<0||p.hour>23||!Number.isInteger(p.minute)||p.minute<0||p.minute>59)return false;new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format();}
      if(typeof s.earnings?.enabled!=='boolean'||!Array.isArray(s.earnings.events)||s.earnings.enabled&&!instant(s.earnings.run_at))return false;
      return Number.isFinite(s.completion_grace_minutes)&&(!status.last_data_update_at||instant(status.last_data_update_at));
    }catch{return false;}
  }
  function view(document,status,now=Date.now()){
    if(!matches(document,status))return {available:false,last_at:null,next:null,rows:[],companies:[],warnings:['更新时间记录暂不可用，资料日期见各项标注。']};
    const schedule=status.schedule,checks=status.checks,states=updates.states(document,now),warnings=states.filter(s=>s.key.startsWith('company:')&&s.warning).map(s=>s.warning);
    const research=occurrences(schedule.research,now),quote=occurrences(schedule.quote,now,true);
    const rows=[{key:'quote',label:'常规收盘行情',...quote,rule:'每个交易日收盘后更新；周末及休市日顺延。'},
      {key:'industry',label:'行业资料',...research,rule:'周三、周日检查供需、价格与产能资料；有新披露时更新。'},
      {key:'news',label:'AI 动态',...research,rule:'周三、周日核查新闻来源，收录实质进展，同一事件合并更新。'}];
    if(document.technology)for(const [topic,label]of [['facilities','工厂与产能'],['processes','制程换代'],['products','同类产品']])rows.push({key:'technology:'+topic,label,...occurrences({...schedule.research,starts_at:schedule.research.technology_starts_at||schedule.research.starts_at},now),rule:'周三、周日检查官方新公告；相关公司财报同时逐项复核。'});
    for(const row of rows){
      Object.assign(row,checks[row.key]);row.warning=states.find(s=>s.key===row.key)?.warning||'';
      const enabled=schedule[row.key==='quote'?'quote':'research'].enabled;
      row.next_label=enabled?'日期待确认':'计划已暂停';
      if(['failed','pending'].includes(row.status)&&!row.warning)row.warning='最近一次核查未完成，保留上次成功记录。';
      if(row.unknown_calendar)row.warning='下一交易年度的休市日历待确认。';
      // A source checked earlier on the scheduled local day has still been checked for that run.
      const completed=row.key==='quote'?row.previous_at&&updates.marketDate(Date.parse(document.quote.as_of))>=updates.marketDate(Date.parse(row.previous_at)):instant(row.last_checked_at)&&localDate(Date.parse(row.last_checked_at),schedule.research.timezone)>=localDate(Date.parse(row.previous_at),schedule.research.timezone);
      if(row.previous_at&&!completed&&now>Date.parse(row.previous_at)+schedule.completion_grace_minutes*60000&&!row.warning)row.warning='上次计划尚无完成记录；保留最近成功核查时间。';
      if(row.warning)warnings.push(`${row.label}：${row.warning}`);
    }
    const companies=[{id:'micron',name:'美光',published_at:document.financial_published_at},...document.ecosystem.companies];
    for(const c of companies)if(['failed','pending'].includes(checks['company:'+c.id]?.status))warnings.push(`${c.name}最近一次核查未完成，保留上次成功记录。`);
    const activeEvents=(document.monitoring?.calendar||[]).filter(e=>e.confirmation==='confirmed'&&e.scheduled_at.slice(0,10)>(companies.find(c=>c.id===e.company_id)?.published_at||'').slice(0,10));
    const financial=[];
    if(schedule.earnings.enabled)for(const binding of schedule.earnings.events){
      const company=companies.find(c=>c.id===binding.company_id),event=activeEvents.find(e=>e.id===binding.id&&e.company_id===binding.company_id);
      const recorded=(document.monitoring?.calendar||[]).find(e=>e.id===binding.id&&e.company_id===binding.company_id);
      if(!event&&recorded&&company&&company.published_at.slice(0,10)>=recorded.scheduled_at.slice(0,10))continue;
      if(!event||event.review_after!==binding.review_after){warnings.push('财报日程已变化，下一次核查计划待同步。');continue;}
      financial.push({key:'company:'+company.id,label:company.name+'财报',at:schedule.earnings.run_at});
      if(Date.parse(schedule.earnings.run_at)<now)warnings.push(`${company.name}财报已到计划核查时间，待确认完成。`);
    }
    const nexts=[...rows.filter(r=>r.next_at).map(r=>({key:r.key,label:r.label,at:r.next_at})),...financial.filter(f=>Date.parse(f.at)>=now)].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const next=nexts[0]?{at:nexts[0].at,label:[...new Set(nexts.filter(x=>x.at===nexts[0].at).map(x=>x.label))].join(' / ')}:null;
    return {available:true,last_at:status.last_data_update_at,next,rows,financial,companies:companies.map(c=>({...c,...checks['company:'+c.id]})),warnings:[...new Set(warnings)]};
  }
  const api={format,wallTime,occurrences,matches,view};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.MonitorUpdateTimes=Object.freeze(api);
})();
