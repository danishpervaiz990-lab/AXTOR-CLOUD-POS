"use strict";

let groceryReportGeneration=0;

function groceryReportRequestCurrent(generation,view,family){
  return generation===groceryReportGeneration&&state.view===view&&REPORT_VIEWS[state.view]===family;
}

reports30=async function(family="all"){
  const generation=++groceryReportGeneration;
  const requestedView=state.view||viewFromUrl();
  loading(reportFamilyTitle(family),"Real tenant-scoped Grocery reporting with filters, percentages, exports and comparison periods");
  try{
    const [catalogD,optsD,vansD,countersD,cashiersD]=await Promise.all([
      get("/api/v1/grocery/report-catalog"),
      get("/api/v1/reports/options"),
      get("/api/v1/grocery/vans").catch(()=>({data:[]})),
      get("/api/v1/grocery/counters").catch(()=>({data:[]})),
      get("/api/v1/grocery/cashiers").catch(()=>({data:[]})),
    ]);
    if(!groceryReportRequestCurrent(generation,requestedView,family))return;
    const catalog=unwrap(catalogD)||{},opts=unwrap(optsD)||{},vans=unwrap(vansD)||[],counters=unwrap(countersD)||[];
    state.report30.catalog=catalog;
    state.report30.family=family;
    state.report30.cashiers=unwrap(cashiersD)||[];
    const familyCards=["sales","product","customer","payment","purchase","inventory","accounting"].map(f=>`<button class="module-card" data-report-family="${f}"><span>${f==="accounting"?'P&L':f.toUpperCase()}</span><h3>${reportFamilyTitle(f)}</h3><p>${(catalog.reports||[]).filter(x=>x.family===f).length} report definitions</p></button>`).join("");
    app.innerHTML=shell(`${family==="all"?`<section class="module-grid">${familyCards}</section>`:""}<section class="panel"><div class="panel-head"><div><h2>${esc(reportFamilyTitle(family))}</h2><p class="muted">Today/yesterday/week/month/quarter/year/custom range · branch/location/entity filters · search · sorting · pagination · comparison period.</p></div></div>${reportFilterForm(catalog,opts,vans,counters,family)}</section><div id="report30-output"></div>`,reportFamilyTitle(family),`${(catalog.reports||[]).filter(x=>family==="all"||x.family===family).length} reports available`);
    bindShell();
    document.querySelectorAll("[data-report-family]").forEach(b=>b.addEventListener("click",()=>navigate(`reports-${b.dataset.reportFamily==='accounting'?'pnl':b.dataset.reportFamily}`)));
    document.getElementById("report30-filter")?.addEventListener("submit",async e=>{e.preventDefault();state.report30.page=1;await runReport30(e.currentTarget);});
    if(state.report30.reportId)await runReport30(document.getElementById("report30-filter"));
  }catch(e){
    if(!groceryReportRequestCurrent(generation,requestedView,family))return;
    renderError(reportFamilyTitle(family),e);
  }
};

runReport30=async function(form){
  if(!form)return;
  const requestedView=state.view||viewFromUrl();
  const family=REPORT_VIEWS[requestedView]||state.report30.family||"all";
  const generation=groceryReportGeneration;
  const o=reportQuery(form),reportId=o.reportId;
  delete o.reportId;
  state.report30.reportId=reportId;
  const out=document.getElementById("report30-output");
  if(out)out.innerHTML=`<section class="panel"><div class="skeleton"></div></section>`;
  try{
    const d=unwrap(await get(`/api/v1/reports/${encodeURIComponent(reportId)}?${new URLSearchParams(o).toString()}`));
    if(!groceryReportRequestCurrent(generation,requestedView,family))return;
    state.report30.result=d;
    renderReport30(d,form);
  }catch(e){
    if(!groceryReportRequestCurrent(generation,requestedView,family))return;
    const current=document.getElementById("report30-output");
    if(current)current.innerHTML=`<div class="notice-error">${esc(e.message)}</div>`;
  }
};
