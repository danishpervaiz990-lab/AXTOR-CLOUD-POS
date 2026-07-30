(function(){
  "use strict";

  const PAGE=document.body.dataset.page||"dashboard";
  const REPORTS=[
    {id:"daily-sales",label:"Daily Sales",filter:"customer",basis:"Paid amount ÷ invoice total"},
    {id:"sale-products",label:"Sales by Product",filter:"product",basis:"Gross profit ÷ product sales"},
    {id:"sale-customer",label:"Sales by Customer",filter:"customer",basis:"Amount paid ÷ customer sales"},
    {id:"sales-return",label:"Returns & Refunds",filter:"customer",basis:"Return amount ÷ total return amount"},
    {id:"stock-valuation",label:"Stock Valuation",filter:"warehouse",basis:"Item stock value ÷ total stock value"},
    {id:"purchase-report",label:"Purchase Report",filter:"supplier",basis:"Amount paid ÷ purchase total"},
    {id:"tax-report",label:"Tax Report",filter:"none",basis:"Tax amount ÷ taxable subtotal"},
    {id:"expense-report",label:"Expense Report",filter:"branch",basis:"Expense amount ÷ total expenses"},
    {id:"profit-loss",label:"Profit & Loss",filter:"none",basis:"Each line ÷ net sales; Gross Profit is gross margin"},
    {id:"trial-balance",label:"Trial Balance",filter:"none",basis:"Account value ÷ total debit or credit side"},
    {id:"balance-sheet",label:"Balance Sheet",filter:"none",basis:"Line amount ÷ total assets"},
    {id:"general-ledger",label:"General Ledger",filter:"none",basis:"Row movement ÷ total ledger movement"},
    {id:"salesman-commission",label:"Salesman Commission",filter:"salesman",basis:"Payout ÷ salesman sales; Achievement % is also shown"},
    {id:"customer-profit-loss",label:"Customer Profit / Loss",filter:"customer",basis:"Customer profit ÷ customer sales"},
    {id:"grocery-expiry-risk",label:"Expiry Risk",filter:"none",basis:"Batch quantity ÷ total quantity in the report"},
    {id:"grocery-waste-share",label:"Waste & Spoilage",filter:"none",basis:"Waste quantity ÷ total waste quantity"},
    {id:"grocery-recall-share",label:"Recall Register",filter:"none",basis:"Recall record ÷ all recall records in the period"}
  ];
  const MONEY_KEYS=new Set(["total","paid","balance","sales","cost","profit","amount","stockValue","retailValue","subtotal","tax","cogs","outstanding","debit","credit","commission","bonus","payout"]);
  const OPERATIONAL=new Set(["grocery-expiry-risk","grocery-waste-share","grocery-recall-share"]);
  let options={};
  let lastReport=null;

  function esc(value){return String(value??"").replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
  function unwrap(value){return value&&Object.prototype.hasOwnProperty.call(value,"data")?value.data:value;}
  function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}
  function money(value){return "QAR "+num(value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function pct(value,base){return Math.abs(num(base))<0.0000001?0:Math.round((num(value)/num(base))*10000)/100;}
  function localDate(date){const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,10);}
  function monthWindow(){const now=new Date();return{from:localDate(new Date(now.getFullYear(),now.getMonth(),1)),to:localDate(now),month:localDate(now).slice(0,7),label:new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(now)};}
  function reportPath(id,from,to){const q=new URLSearchParams({from:from,to:to});return "/api/v1/reports/"+encodeURIComponent(id)+"?"+q.toString();}
  function summaryValue(report,label){const row=(report?.summary||[]).find(function(item){return String(item.label||"").toLowerCase()===String(label).toLowerCase();});return num(row?.value);}
  function isPercent(column){return /pct$/i.test(column.key||"")||/%/.test(column.label||"")||column.key==="achievement";}
  function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?String(value??"—"):new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);}
  function formatCell(value,column){if(isPercent(column))return num(value).toFixed(2)+"%";if(column.key==="date"||/date$/i.test(column.key||"")||/At$/.test(column.key||""))return formatDate(value);if(MONEY_KEYS.has(column.key))return money(value);if(typeof value==="number")return value.toLocaleString("en-US",{maximumFractionDigits:3});return String(value??"—");}
  function safeHtmlStatus(text,type){return '<div class="g-status '+esc(type||"")+'">'+esc(text||"")+'</div>';}

  async function waitForApp(){for(let i=0;i<60;i+=1){const app=document.getElementById("app");if(app)return app;await new Promise(function(resolve){setTimeout(resolve,100);});}throw new Error("Grocery application shell did not load.");}
  async function verifyTenant(){const registry=unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry"))||{};const code=String(registry.selection?.code||registry.selected?.code||"").toLowerCase();if(code!=="grocery")throw new Error("This application is available only to Grocery / Supermarket tenants.");}
  async function safeGet(path,fallback){try{return unwrap(await AxtorAPI.apiGet(path))??fallback;}catch(error){console.warn("Optional Grocery data unavailable",path,error);return fallback;}}

  function renderDashboardProducts(report){const rows=(report?.rows||[]).slice().sort(function(a,b){return num(b.sales)-num(a.sales);}).slice(0,10);return rows.map(function(row){return "<tr><td><strong>"+esc(row.product||"-")+"</strong><small>"+esc(row.sku||"-")+"</small></td><td>"+num(row.qty).toLocaleString("en-US",{maximumFractionDigits:3})+"</td><td>"+money(row.sales)+"</td><td>"+money(row.profit)+"</td><td><span class=\"g-percent\">"+num(row.marginPct).toFixed(2)+"%</span></td></tr>";}).join("")||'<tr><td colspan="5">No product sales found for this month.</td></tr>';}
  function renderCommission(report){const rows=(report?.rows||[]).slice().sort(function(a,b){return num(b.sales)-num(a.sales);}).slice(0,8);return rows.map(function(row){return "<tr><td>"+esc(row.salesman||"-")+"</td><td>"+money(row.sales)+"</td><td><span class=\"g-percent\">"+num(row.achievement).toFixed(2)+"%</span></td><td>"+money(row.payout)+"</td><td><span class=\"g-percent\">"+num(row.payoutPct).toFixed(2)+"%</span></td><td>"+esc(row.status||"-")+"</td></tr>";}).join("")||'<tr><td colspan="6">No commission payout rows found for this month.</td></tr>';}

  async function dashboard(){
    const app=await waitForApp();
    const period=monthWindow();
    const today=localDate(new Date());
    app.innerHTML='<div class="g-kpis g-kpis-expanded">'+
      '<div class="g-kpi"><span>Today Sales</span><strong id="gTodaySales">—</strong><small>Daily Sales report</small></div>'+
      '<div class="g-kpi"><span>Today Invoices</span><strong id="gTodayInvoices">—</strong><small>Invoice-only count</small></div>'+
      '<div class="g-kpi"><span id="gMonthSalesLabel">Monthly Sales</span><strong id="gMonthSales">—</strong><small>Daily Sales report</small></div>'+
      '<div class="g-kpi"><span>Monthly Gross Profit</span><strong id="gMonthProfit">—</strong><small>Profit & Loss report</small></div>'+
      '<div class="g-kpi"><span>Gross Margin</span><strong id="gMonthMargin">—</strong><small>Gross profit ÷ net sales</small></div>'+
      '<div class="g-kpi"><span>Expiring in 30 Days</span><strong id="gNearExpiry">—</strong><small>FEFO batch register</small></div>'+
      '<div class="g-kpi"><span>Blocked Batches</span><strong id="gBlockedBatches">—</strong><small>Expired, recalled or quarantined</small></div>'+
      '<div class="g-kpi"><span>Open Recalls</span><strong id="gOpenRecalls">—</strong><small>Recall register</small></div></div>'+
      '<section class="g-panel"><div class="g-panel-head"><div><h2>Top Products This Month</h2><p>Exactly the same rows used by Sales by Product report.</p></div><a class="g-link" href="grocery-reports.html">Open Reports</a></div><div class="g-table-wrap"><table class="g-table"><thead><tr><th>Product</th><th>Qty</th><th>Sales</th><th>Profit</th><th>Margin %</th></tr></thead><tbody id="gTopProducts"><tr><td colspan="5">Loading report-backed products…</td></tr></tbody></table></div></section>'+
      '<section class="g-panel"><div class="g-panel-head"><div><h2>Salesman Commission This Month</h2><p>Live gross sales, achievement and payout percentages.</p></div></div><div class="g-table-wrap"><table class="g-table"><thead><tr><th>Salesman</th><th>Sales</th><th>Achievement %</th><th>Payout</th><th>Payout %</th><th>Status</th></tr></thead><tbody id="gCommission"><tr><td colspan="6">Loading commission report…</td></tr></tbody></table></div></section>'+
      '<section class="g-panel"><h2>Fresh Stock Control</h2><div class="g-control-grid"><div><span>Waste records</span><strong id="gWasteRecords">—</strong></div><div><span>Low-stock products</span><strong id="gLowStock">—</strong></div><div><span>Outstanding receivables</span><strong id="gReceivables">—</strong></div><div><span>Report period</span><strong id="gReportPeriod">—</strong></div></div><div class="g-note">Monthly Sales, Gross Profit, Gross Margin and Top Products are loaded from the same invoice-only report endpoints used by Grocery Reports. Dashboard and Reports are synchronized.</div><div id="gDashboardStatus" class="g-status"></div></section>';
    try{
      const financial=await Promise.all([
        AxtorAPI.apiGet(reportPath("daily-sales",today,today)),
        AxtorAPI.apiGet(reportPath("daily-sales",period.from,period.to)),
        AxtorAPI.apiGet(reportPath("sale-products",period.from,period.to)),
        AxtorAPI.apiGet(reportPath("profit-loss",period.from,period.to)),
        AxtorAPI.apiGet("/api/v1/reports/salesman-commission?month="+encodeURIComponent(period.month))
      ]);
      const extras=await Promise.all([
        safeGet("/api/v1/dashboard/summary",{}),
        safeGet("/api/v1/industry/batches?limit=500",[]),
        safeGet("/api/v1/industry/records?entityType=grocery_waste&limit=500",[]),
        safeGet("/api/v1/industry/records?entityType=grocery_recall&limit=500",[])
      ]);
      const todayReport=unwrap(financial[0])||{};
      const monthReport=unwrap(financial[1])||{};
      const productReport=unwrap(financial[2])||{};
      const profitReport=unwrap(financial[3])||{};
      const commissionReport=unwrap(financial[4])||{};
      const summary=extras[0]||{};
      const batches=extras[1]||[];
      const waste=extras[2]||[];
      const recalls=extras[3]||[];
      const now=Date.now();
      const nearLimit=now+30*86400000;
      const nearExpiry=batches.filter(function(row){const expiry=row.expiryDate?new Date(row.expiryDate).getTime():0;return expiry>=now&&expiry<=nearLimit;}).length;
      const blocked=batches.filter(function(row){return["expired","quarantined","recalled","damaged"].includes(String(row.status||"").toLowerCase());}).length;
      const grossRow=(profitReport.rows||[]).find(function(row){return row.line==="Gross Profit";})||{};
      const grossProfit=summaryValue(profitReport,"Gross Profit")||num(grossRow.amount);
      const grossMargin=summaryValue(profitReport,"Gross Margin %")||num(grossRow.salesPct);
      document.getElementById("gTodaySales").textContent=money(summaryValue(todayReport,"Sales"));
      document.getElementById("gTodayInvoices").textContent=String(summaryValue(todayReport,"Invoices"));
      document.getElementById("gMonthSalesLabel").textContent=period.label+" Sales";
      document.getElementById("gMonthSales").textContent=money(summaryValue(monthReport,"Sales"));
      document.getElementById("gMonthProfit").textContent=money(grossProfit);
      document.getElementById("gMonthMargin").textContent=grossMargin.toFixed(2)+"%";
      document.getElementById("gNearExpiry").textContent=String(nearExpiry);
      document.getElementById("gBlockedBatches").textContent=String(blocked);
      document.getElementById("gOpenRecalls").textContent=String(recalls.filter(function(row){return String(row.status||"").toLowerCase()!=="closed";}).length);
      document.getElementById("gWasteRecords").textContent=String(waste.length);
      document.getElementById("gLowStock").textContent=String(summary.inventory?.lowStockCount||0);
      document.getElementById("gReceivables").textContent=money(summary.receivables?.outstanding||0);
      document.getElementById("gReportPeriod").textContent=period.from+" to "+period.to;
      document.getElementById("gTopProducts").innerHTML=renderDashboardProducts(productReport);
      document.getElementById("gCommission").innerHTML=renderCommission(commissionReport);
      document.getElementById("gDashboardStatus").textContent="Dashboard and Reports reconciled from the same live PostgreSQL report endpoints.";
      document.getElementById("gDashboardStatus").className="g-status ok";
      const sync=document.getElementById("grocerySyncText");if(sync)sync.textContent="Synced with Reports · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    }catch(error){document.getElementById("gDashboardStatus").innerHTML=safeHtmlStatus(error.message||"Dashboard report synchronization failed.","error");}
  }

  function definition(){const id=document.getElementById("gReportSelect")?.value||REPORTS[0].id;return REPORTS.find(function(row){return row.id===id;})||REPORTS[0];}
  function listFor(filter){if(filter==="branch")return options.branches||[];if(filter==="customer")return options.customers||[];if(filter==="product")return options.products||[];if(filter==="supplier")return options.suppliers||[];if(filter==="salesman")return options.salesmen||[];if(filter==="warehouse")return options.warehouses||[];return[];}
  function refreshFilter(){const def=definition();const select=document.getElementById("gReportFilter");const rows=listFor(def.filter);select.disabled=def.filter==="none";select.innerHTML='<option value="">All records</option>'+rows.map(function(row){const name=def.filter==="product"&&row.sku?row.sku+" — "+row.name:row.name;return '<option value="'+esc(row.id)+'">'+esc(name||row.id)+"</option>";}).join("");document.getElementById("gReportBasis").textContent="Percentage basis: "+def.basis;}
  function renderSummary(report){const count=/invoices|customers|entries|products|returns|batches|records|recalls|count/i;document.getElementById("gReportSummary").innerHTML=(report.summary||[]).map(function(item){let value;if(item.format==="percent"||/%/.test(item.label||""))value=num(item.value).toFixed(2)+"%";else if(count.test(item.label||""))value=num(item.value).toLocaleString("en-US");else value=money(item.value);return '<div class="g-summary"><span>'+esc(item.label||"Total")+'</span><strong>'+esc(value)+"</strong></div>";}).join("")||'<div class="g-summary"><span>Rows</span><strong>'+num(report.rows?.length).toLocaleString("en-US")+"</strong></div>";}
  function renderReport(report,def){lastReport=report;const columns=Array.isArray(report.columns)?report.columns:[];const rows=Array.isArray(report.rows)?report.rows:[];document.getElementById("gReportTitle").textContent=report.title||def.label;document.getElementById("gReportBasis").textContent="Percentage basis: "+def.basis;document.getElementById("gReportCount").textContent=rows.length.toLocaleString("en-US")+" row"+(rows.length===1?"":"s");document.getElementById("gReportHead").innerHTML="<tr>"+columns.map(function(column){return"<th>"+esc(column.label||column.key)+"</th>";}).join("")+"</tr>";document.getElementById("gReportBody").innerHTML=rows.length?rows.map(function(row){return"<tr>"+columns.map(function(column){const value=formatCell(row[column.key],column);return isPercent(column)?'<td><span class="g-percent">'+esc(value)+"</span></td>":"<td>"+esc(value)+"</td>";}).join("")+"</tr>";}).join(""):'<tr><td colspan="'+Math.max(columns.length,1)+'">No records found for this period.</td></tr>';renderSummary(report);}
  function inRange(value,from,to){const stamp=new Date(value).getTime();if(!Number.isFinite(stamp))return true;const start=from?new Date(from+"T00:00:00").getTime():-Infinity;const end=to?new Date(to+"T23:59:59.999").getTime():Infinity;return stamp>=start&&stamp<=end;}

  async function operationalReport(def,from,to){
    if(def.id==="grocery-expiry-risk"){
      const batches=(await safeGet("/api/v1/industry/batches?limit=500",[])).filter(function(row){return row.expiryDate&&inRange(row.expiryDate,from,to);}).sort(function(a,b){return new Date(a.expiryDate).getTime()-new Date(b.expiryDate).getTime();});
      const totalQty=batches.reduce(function(sum,row){return sum+num(row.qtyOnHandBase);},0);
      const now=Date.now();
      const rows=batches.map(function(row){const expiry=new Date(row.expiryDate).getTime();return{product:row.product?.name||row.productName||"-",batchNo:row.batchNo||"-",warehouse:row.warehouse?.name||row.warehouseId||"-",expiryDate:row.expiryDate,daysRemaining:Math.ceil((expiry-now)/86400000),qty:num(row.qtyOnHandBase),status:row.status||"-",quantitySharePct:pct(row.qtyOnHandBase,totalQty)};});
      const riskQty=rows.filter(function(row){return row.daysRemaining<=30||["expired","near_expiry","quarantined","recalled"].includes(String(row.status).toLowerCase());}).reduce(function(sum,row){return sum+row.qty;},0);
      return{title:"Grocery Expiry Risk Report",columns:[{key:"product",label:"Product"},{key:"batchNo",label:"Batch"},{key:"warehouse",label:"Warehouse"},{key:"expiryDate",label:"Expiry Date"},{key:"daysRemaining",label:"Days Remaining"},{key:"qty",label:"Quantity"},{key:"status",label:"Status"},{key:"quantitySharePct",label:"Quantity Share %"}],rows:rows,summary:[{label:"Batches",value:rows.length},{label:"Total Quantity",value:totalQty},{label:"Risk Quantity",value:riskQty},{label:"Risk %",value:pct(riskQty,totalQty),format:"percent"}]};
    }
    if(def.id==="grocery-waste-share"){
      const records=(await safeGet("/api/v1/industry/records?entityType=grocery_waste&limit=500",[])).filter(function(row){return inRange(row.data?.occurredAt||row.createdAt,from,to);});
      const totalQty=records.reduce(function(sum,row){return sum+num(row.data?.quantity);},0);
      const rows=records.map(function(row){return{reference:row.referenceNo||"-",product:row.displayName||row.data?.productReference||"-",batchNo:row.data?.batchNo||"-",quantity:num(row.data?.quantity),unit:row.data?.unit||"-",reason:row.data?.reason||"-",occurredAt:row.data?.occurredAt||row.createdAt,status:row.status||"-",wasteSharePct:pct(row.data?.quantity,totalQty)};});
      return{title:"Grocery Waste & Spoilage Report",columns:[{key:"reference",label:"Reference"},{key:"product",label:"Product"},{key:"batchNo",label:"Batch"},{key:"quantity",label:"Quantity"},{key:"unit",label:"Unit"},{key:"reason",label:"Reason"},{key:"occurredAt",label:"Date"},{key:"status",label:"Status"},{key:"wasteSharePct",label:"Waste Share %"}],rows:rows,summary:[{label:"Waste Records",value:rows.length},{label:"Total Waste Quantity",value:totalQty}]};
    }
    const records=(await safeGet("/api/v1/industry/records?entityType=grocery_recall&limit=500",[])).filter(function(row){return inRange(row.data?.openedAt||row.createdAt,from,to);});
    const rows=records.map(function(row){return{reference:row.referenceNo||"-",product:row.displayName||row.data?.productReference||"-",batchNo:row.data?.batchNo||"-",supplier:row.data?.supplierReference||"-",reason:row.data?.reason||"-",openedAt:row.data?.openedAt||row.createdAt,status:row.status||"-",recallSharePct:pct(1,records.length)};});
    return{title:"Grocery Recall Register",columns:[{key:"reference",label:"Recall"},{key:"product",label:"Product"},{key:"batchNo",label:"Batch"},{key:"supplier",label:"Supplier"},{key:"reason",label:"Reason"},{key:"openedAt",label:"Opened"},{key:"status",label:"Status"},{key:"recallSharePct",label:"Recall Share %"}],rows:rows,summary:[{label:"Recall Records",value:rows.length},{label:"Open Recalls",value:rows.filter(function(row){return String(row.status).toLowerCase()!=="closed";}).length}]};
  }

  function sharedPath(def){const from=String(document.getElementById("gReportFrom").value||"").trim();const to=String(document.getElementById("gReportTo").value||"").trim();const entity=String(document.getElementById("gReportFilter").value||"").trim();const q=new URLSearchParams();if(def.id==="salesman-commission")q.set("month",(from||localDate(new Date())).slice(0,7));else{if(from)q.set("from",from);if(to)q.set("to",to);}if(entity&&def.filter!=="none")q.set(def.filter+"Id",entity);return "/api/v1/reports/"+encodeURIComponent(def.id)+"?"+q.toString();}
  async function runReport(){const def=definition();const button=document.getElementById("gRunReport");const status=document.getElementById("gReportStatus");button.disabled=true;button.textContent="Loading…";status.textContent="Loading live report data…";status.className="g-status";try{const from=String(document.getElementById("gReportFrom").value||"").trim();const to=String(document.getElementById("gReportTo").value||"").trim();const report=OPERATIONAL.has(def.id)?await operationalReport(def,from,to):unwrap(await AxtorAPI.apiGet(sharedPath(def)));renderReport(report||{},def);status.textContent="Report loaded successfully from live tenant data.";status.className="g-status ok";}catch(error){status.textContent=error.message||"Report could not be loaded.";status.className="g-status error";document.getElementById("gReportBody").innerHTML='<tr><td class="g-error">'+esc(error.message||"Report failed")+"</td></tr>";}finally{button.disabled=false;button.textContent="Run Report";}}
  function csvValue(value){return '"'+String(value??"").replaceAll('"','""')+'"';}
  function exportCsv(){if(!lastReport)return;const columns=lastReport.columns||[];const lines=[columns.map(function(column){return csvValue(column.label||column.key);}).join(",")];(lastReport.rows||[]).forEach(function(row){lines.push(columns.map(function(column){return csvValue(formatCell(row[column.key],column));}).join(","));});const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=(lastReport.title||"grocery-report").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".csv";document.body.appendChild(link);link.click();URL.revokeObjectURL(link.href);link.remove();}

  async function reports(){
    const app=await waitForApp();
    const period=monthWindow();
    app.innerHTML='<section class="g-panel"><div class="g-panel-head"><div><h2>Report Controls</h2><p>Every report includes a meaningful percentage column and states its calculation basis.</p></div><div class="g-report-actions"><button id="gExportReport" class="g-btn secondary" type="button">Export CSV</button><button id="gPrintReport" class="g-btn secondary" type="button">Print</button></div></div><div class="g-report-controls"><div><label>Report</label><select id="gReportSelect"></select></div><div><label>From</label><input id="gReportFrom" type="date" value="'+esc(period.from)+'"></div><div><label>To</label><input id="gReportTo" type="date" value="'+esc(period.to)+'"></div><div><label>Filter</label><select id="gReportFilter"><option value="">All records</option></select></div><div><button id="gRunReport" class="g-btn" type="button">Run Report</button></div></div><div id="gReportStatus" class="g-status"></div></section><div id="gReportSummary" class="g-summary-grid"></div><section class="g-panel"><div class="g-panel-head"><div><h2 id="gReportTitle">Select a report</h2><p id="gReportBasis">Percentage basis will appear here.</p></div><strong id="gReportCount"></strong></div><div class="g-table-wrap"><table class="g-table"><thead id="gReportHead"><tr><th>Report</th><th>Percentage</th></tr></thead><tbody id="gReportBody"><tr><td colspan="2">Loading report options…</td></tr></tbody></table></div></section>';
    document.getElementById("gReportSelect").innerHTML=REPORTS.map(function(row){return'<option value="'+esc(row.id)+'">'+esc(row.label)+"</option>";}).join("");
    options=await safeGet("/api/v1/reports/options",{});
    refreshFilter();
    document.getElementById("gReportSelect").addEventListener("change",function(){refreshFilter();runReport();});
    document.getElementById("gRunReport").addEventListener("click",runReport);
    document.getElementById("gExportReport").addEventListener("click",exportCsv);
    document.getElementById("gPrintReport").addEventListener("click",function(){window.print();});
    await runReport();
  }

  document.addEventListener("DOMContentLoaded",function(){setTimeout(async function(){try{if(PAGE!=="dashboard"&&PAGE!=="reports")return;await verifyTenant();if(PAGE==="dashboard")await dashboard();else await reports();}catch(error){const app=await waitForApp().catch(function(){return null;});if(app)app.innerHTML=safeHtmlStatus(error.message||"Grocery reporting failed.","error");}},150);});
})();
