(function(){
  'use strict';
  const companies={micron:'美光',samsung:'三星',skhynix:'SK 海力士'};
  const stages={announced:'已公布计划',construction:'建设中',sampling:'已送样',qualification:'客户验证',production:'已量产',ramping:'量产爬坡',certified:'已获认证',listed:'产品目录在列'};
  const roles={wafer_fab:'晶圆制造',assembly_test:'封装测试',advanced_packaging:'先进封装'};
  const kinds={actual:'公司披露',plan:'公司计划',vendor_claim:'厂商测试',unavailable:'未披露'};
  const groups={ddr5_rdimm:'DDR5 RDIMM',hbm4:'HBM4',hbm4e:'HBM4E'};
  const fact=(item,id)=>item?.facts?.find(f=>f.id===id);
  function value(f){
    if(!f||f.value===null)return '未披露';
    const units={pct:'%',GB:' GB',Gb:' Gb',MTps:' MT/s',Gbps:' Gbps',TBps:' TB/s',W:' W',layers:' 层','chips/year':' 颗/年','wafers/month':' 片/月','bits/wafer_pct':'%','areal_density_pct':'%'};
    return (f.qualifier||'')+(typeof f.value==='number'?f.value.toLocaleString('en-US',{maximumFractionDigits:2}):f.value)+(units[f.unit]??(f.unit?' '+f.unit:''));
  }
  function comparison(items,group,peer='samsung'){
    return ['micron','samsung','skhynix'].map(company=>({company,item:items.find(i=>i.type==='product'&&i.family===group&&i.company_id===company),mobile:company==='micron'||company===peer}));
  }
  // Absolute power can only be compared when every recorded test condition matches.
  function comparablePower(a,b){
    if(!a||!b||a.family!==b.family)return false;
    const x=a.power_test,y=b.power_test;
    const fields=['capacity_gb','speed_mtps','platform','workload','voltage','temperature_c','method'];
    return x&&y&&x.metric==='operating_power_w'&&y.metric===x.metric&&fields.every(k=>x[k]!==null&&x[k]!==''&&x[k]!==undefined&&x[k]===y[k])&&Number.isFinite(fact(a,'power')?.value)&&Number.isFinite(fact(b,'power')?.value);
  }
  function isRenderable(d){
    const t=d.technology;if(!t||t.version!==1||!Array.isArray(t.items))return false;
    return t.items.every(i=>i&&['facility','process','product'].includes(i.type)&&companies[i.company_id]&&stages[i.stage]&&i.id&&i.name&&i.as_of&&i.summary&&Array.isArray(i.source_ids)&&i.source_ids.every(s=>d.sources[s])&&Array.isArray(i.facts)&&i.facts.every(f=>f&&f.id&&f.label&&kinds[f.nature]&&Array.isArray(f.source_ids)&&f.source_ids.every(s=>d.sources[s])));
  }
  const api={companies,stages,roles,kinds,groups,fact,value,comparison,comparablePower,isRenderable};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.MonitorTechnology=Object.freeze(api);
})();
