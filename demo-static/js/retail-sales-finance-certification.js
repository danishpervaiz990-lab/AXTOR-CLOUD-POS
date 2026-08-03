(function(){
  "use strict";
  const MAX_LIMIT=500;
  const PRINT_KEY="axtor:retail:invoice:output";

  function appendLimit(path){
    const value=String(path||"");
    if(!/^\/api\/v1\/(products|customers|sales-documents|sales-returns|refunds)(\?|$)/.test(value)) return value;
    if(/[?&]limit=/.test(value)) return value;
    return value+(value.includes("?")?"&":"?")+"limit="+MAX_LIMIT;
  }

  function patchApi(){
    const api=window.AxtorAPI;
    if(!api||api.__retailFinanceCertified) return false;
    if(typeof api.request==="function"){
      const original=api.request.bind(api);
      api.request=function(method,path,body,options){
        return original(method,String(method||"GET").toUpperCase()==="GET"?appendLimit(path):path,body,options);
      };
    }
    if(typeof api.apiGet==="function"){
      const originalGet=api.apiGet.bind(api);
      api.apiGet=function(path,options){return originalGet(appendLimit(path),options);};
    }
    api.__retailFinanceCertified=true;
    return true;
  }

  function refreshAdapters(){
    try{window.AxtorSalesBackend?.refreshProducts?.();}catch(error){console.warn("Retail product refresh skipped",error);}
    try{window.AxtorSalesBackend?.refresh?.({preserveSearch:true,preserveTab:true});}catch(error){console.warn("Retail sales refresh skipped",error);}
    try{window.AxtorReturnsBackend?.refresh?.(true);}catch(error){console.warn("Retail returns refresh skipped",error);}
  }

  function printProfile(){
    const saved=localStorage.getItem(PRINT_KEY)||localStorage.getItem("axtorInvoiceOutput")||"a4";
    return ["a4","80mm","58mm"].includes(saved)?saved:"a4";
  }

  function openDocument(id,printNow){
    if(!id) return;
    const query=new URLSearchParams({id:String(id),industry:"retail",profile:printProfile()});
    if(printNow) query.set("print","1");
    window.open("invoice-view.html?"+query.toString(),"_blank","noopener");
  }

  function bindPrintHandoff(){
    if(document.documentElement.dataset.retailPrintCertified==="1") return;
    document.documentElement.dataset.retailPrintCertified="1";
    document.addEventListener("click",function(event){
      const printButton=event.target.closest("[data-retail-print-id]");
      if(printButton){event.preventDefault();openDocument(printButton.dataset.retailPrintId,true);return;}
      const button=event.target.closest("button,a");
      if(!button) return;
      const label=String(button.textContent||"").trim().toLowerCase();
      if(label!=="print"&&!label.includes("print invoice")&&!label.includes("print receipt")) return;
      const row=button.closest("[data-sales-doc-row],tr");
      const id=button.getAttribute("data-sales-view-id")||row?.getAttribute("data-sales-doc-row")||row?.querySelector("[data-sales-view-id]")?.getAttribute("data-sales-view-id");
      if(id){event.preventDefault();event.stopImmediatePropagation();openDocument(id,true);}
    },true);
  }

  function upgradePrintButtons(){
    document.querySelectorAll("[data-sales-view-id]").forEach(function(button){
      if(String(button.textContent||"").trim().toLowerCase()==="print"){
        button.setAttribute("data-retail-print-id",button.getAttribute("data-sales-view-id"));
        button.removeAttribute("data-sales-view-id");
      }
    });
  }

  function reconcileFinancialLabels(){
    const state=window.AxtorReturnsBackend?.getState?.();
    if(!state||!Array.isArray(state.invoices)) return;
    state.invoices.forEach(function(doc){
      const amount=Number(doc.amount||0),paid=Number(doc.paidAmount||0),returned=Number(doc.returnedAmount||0),refunded=Number(doc.refundedAmount||0);
      doc.refundBalance=Math.max(0,Math.min(returned,paid)-refunded);
      doc.netRetained=Math.max(0,amount-returned);
    });
  }

  function run(){
    const patched=patchApi();
    bindPrintHandoff();
    upgradePrintButtons();
    reconcileFinancialLabels();
    if(patched) setTimeout(refreshAdapters,50);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run); else run();
  const observer=new MutationObserver(function(){upgradePrintButtons();reconcileFinancialLabels();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
