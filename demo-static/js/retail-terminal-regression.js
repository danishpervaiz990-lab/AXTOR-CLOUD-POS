/* Retail Terminal regression guard: tenant-backed customers/salesmen and clean counter labels. */
(function(){
  "use strict";
  function unwrap(v){return v&&Object.prototype.hasOwnProperty.call(v,"data")?v.data:v;}
  function list(v){var d=unwrap(v)||[];return Array.isArray(d)?d:(d.items||d.records||d.customers||d.salesmen||[]);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];});}
  function option(value,label){return '<option value="'+esc(value)+'">'+esc(label)+'</option>';}
  async function loadCustomers(){
    var select=document.getElementById("terminalCustomer");if(!select||!window.AxtorAPI)return;
    var selected=select.value;
    var rows=list(await window.AxtorAPI.apiGet("/api/v1/customers?limit=500",{cache:false}));
    select.innerHTML=option("","Walk-in Customer")+rows.filter(function(r){return r&&r.id;}).map(function(r){return option(r.id,(r.name||r.displayName||"Customer")+(r.phone?" — "+r.phone:""));}).join("");
    if(rows.some(function(r){return String(r.id)===String(selected);}))select.value=selected;
  }
  async function loadSalesmen(){
    var select=document.getElementById("saleSmId");if(!select||!window.AxtorAPI)return;
    var selected=select.value;
    var rows=list(await window.AxtorAPI.apiGet("/api/v1/salesmen?month="+new Date().toISOString().slice(0,7),{cache:false})).map(function(r){return r.salesman||r;}).filter(function(r){return r&&r.id&&r.active!==false;});
    select.innerHTML=option("","— Select Salesman (optional) —")+rows.map(function(r){return option(r.id,r.name||r.displayName||"Salesman");}).join("");
    if(rows.some(function(r){return String(r.id)===String(selected);}))select.value=selected;
  }
  function cleanCounterOptions(){
    var select=document.getElementById("terminalCounterSelect");if(!select)return;
    Array.from(select.options).forEach(function(row){row.textContent=String(row.textContent||"").replace(/^"+|"+$/g,"").trim();});
  }
  async function refresh(){
    var tasks=[loadCustomers(),loadSalesmen()];
    await Promise.allSettled(tasks);
    cleanCounterOptions();
  }
  function start(){
    refresh().catch(function(e){console.warn("Retail terminal regression guard:",e&&e.message||e);});
    setTimeout(cleanCounterOptions,500);
    window.addEventListener("axtor:salesmen-migrated",function(){loadSalesmen().catch(function(){});});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  window.AxtorRetailTerminalRegression={refresh:refresh,loadCustomers:loadCustomers,loadSalesmen:loadSalesmen};
})();
