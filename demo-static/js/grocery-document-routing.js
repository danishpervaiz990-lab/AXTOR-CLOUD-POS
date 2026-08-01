(function(){
  "use strict";

  const PAGE=document.body.dataset.page||"";
  const PRINT_KEY="axtor:grocery:invoice:output";

  function outputProfile(){
    const cached=String(localStorage.getItem(PRINT_KEY)||document.documentElement.dataset.invoiceOutput||"a4").toLowerCase();
    if(cached.includes("58"))return "thermal-58";
    if(cached.includes("80"))return "thermal-80";
    return "a4";
  }

  function encodePayload(payload){
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function documentUrl(options){
    const url=new URL("invoice-view.html",location.href);
    if(options.id)url.searchParams.set("id",options.id);
    if(options.documentNo)url.searchParams.set("documentNo",options.documentNo);
    if(options.payload)url.searchParams.set("data",encodePayload(options.payload));
    url.searchParams.set("profile",outputProfile());
    if(options.print)url.searchParams.set("print","1");
    url.searchParams.set("industry","grocery");
    return url.href;
  }

  function openDocument(options){
    window.open(documentUrl(options),"_blank","noopener");
  }

  function returnPayload(record){
    const data=record&&record.data||{};
    const quantity=Number(data.quantity||0);
    const amount=Number(data.refundAmount||data.amount||0);
    return {
      template: outputProfile()==="a4"?"modern-a4":outputProfile(),
      documentType:"sales_return",
      documentNo:record.referenceNo||data.reference||"RETURN",
      invoiceNo:data.invoiceNo||"",
      date:record.createdAt||new Date().toISOString(),
      customer:data.customerName||"Grocery Customer",
      paymentMethod:data.refundMethod||"",
      status:record.status||"pending_approval",
      subtotal:amount,
      total:amount,
      grand:amount,
      paid:amount,
      balance:0,
      notes:"Disposition: "+String(data.disposition||"inspection"),
      items:[{
        sku:data.productReference||"ITEM",
        name:data.productName||data.productReference||"Returned grocery item",
        qty:quantity,
        rate:quantity>0?amount/quantity:amount,
        total:amount,
        batchNo:data.batchNo||""
      }]
    };
  }

  async function apiGet(path){
    const response=await fetch(AxtorAPI.getApiBaseUrl()+path,{headers:{Accept:"application/json",Authorization:"Bearer "+AxtorAPI.getToken()},cache:"no-store"});
    const json=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(json?.error?.message||"Unable to load Grocery documents");
    return json?.data??json;
  }

  async function enhanceReturnRows(){
    if(PAGE!=="sales")return;
    const host=document.getElementById("returnRows");
    if(!host||host.dataset.groceryPrintReady==="1")return;
    const records=await apiGet("/api/v1/industry/records?entityType=grocery_sales_return&limit=500");
    const list=Array.isArray(records)?records:records?.items||records?.records||[];
    const table=host.querySelector("table");
    if(!table)return;
    const head=table.querySelector("thead tr");
    if(head&&!head.querySelector("[data-grocery-print-heading]")){
      const th=document.createElement("th");
      th.dataset.groceryPrintHeading="1";
      th.textContent="Document";
      head.appendChild(th);
    }
    table.querySelectorAll("tbody tr").forEach(function(row,index){
      if(row.querySelector("[data-grocery-return-print]"))return;
      const record=list[index];
      const cell=document.createElement("td");
      if(record){
        const button=document.createElement("button");
        button.type="button";
        button.className="g-btn secondary";
        button.textContent="View / Print";
        button.dataset.groceryReturnPrint=encodePayload(record);
        cell.appendChild(button);
      }else cell.textContent="—";
      row.appendChild(cell);
    });
    host.dataset.groceryPrintReady="1";
  }

  function bindRouting(){
    document.addEventListener("click",function(event){
      const target=event.target.closest("[data-grocery-document-id],[data-grocery-document-no],[data-grocery-return-print],[data-grocery-refund-print]");
      if(!target)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if(target.dataset.groceryReturnPrint){
        const record=JSON.parse(decodeURIComponent(escape(atob(target.dataset.groceryReturnPrint))));
        openDocument({payload:returnPayload(record),print:false});
        return;
      }
      if(target.dataset.groceryRefundPrint){
        const payload=JSON.parse(decodeURIComponent(escape(atob(target.dataset.groceryRefundPrint))));
        openDocument({payload,print:false});
        return;
      }
      openDocument({id:target.dataset.groceryDocumentId||"",documentNo:target.dataset.groceryDocumentNo||"",print:target.hasAttribute("data-grocery-print-now")});
    },true);
  }

  function refresh(){
    enhanceReturnRows().catch(function(error){console.error("Grocery return print enhancement failed:",error);});
  }

  document.addEventListener("DOMContentLoaded",function(){
    bindRouting();
    refresh();
    setTimeout(refresh,250);
    setTimeout(refresh,900);
    if(document.body)new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
  });

  window.AxtorGroceryDocuments=Object.freeze({documentUrl,openDocument,returnPayload,outputProfile});
})();
