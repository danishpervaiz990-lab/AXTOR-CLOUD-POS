(function(){
  "use strict";
  const PROFILE_KEY="axtor.hardware.print.profile";
  function profile(){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}")||{}}catch{return {}}}
  function template(){const size=String(profile().defaultPrintSize||"a4").toLowerCase();return size.includes("58")?"thermal-58":size.includes("80")?"thermal-80":"modern-a4"}
  function encode(data){return btoa(unescape(encodeURIComponent(JSON.stringify(data))))}
  function openDocument(payload,print){const url="invoice-view.html?data="+encodeURIComponent(encode(Object.assign({template:template(),industry:"hardware"},payload||{})));const w=window.open(url,"_blank","noopener");if(print&&w)w.addEventListener("load",()=>w.print(),{once:true});return url}
  function openSaved(ref,print){const q=new URLSearchParams();if(ref?.id)q.set("id",ref.id);else if(ref?.documentNo)q.set("documentNo",ref.documentNo);q.set("template",template());q.set("industry","hardware");const url="invoice-view.html?"+q.toString();const w=window.open(url,"_blank","noopener");if(print&&w)w.addEventListener("load",()=>w.print(),{once:true});return url}
  function normalize(kind,row){const d=row?.data||row||{};return {documentType:kind,documentNo:row?.referenceNo||row?.documentNo||d.reference||d.lpoNo||d.deliveryNo||"Hardware document",date:row?.createdAt||d.date||new Date().toISOString(),customer:d.customerName||d.customer||d.tradeCustomer||"Trade customer",project:d.projectName||d.project||d.jobCode||"",lpo:d.lpoNo||d.lpo||"",deliveryStatus:d.deliveryStatus||row?.status||"",serialNumber:d.serialNumber||d.serial||"",warrantyUntil:d.warrantyUntil||d.warrantyEnd||"",items:Array.isArray(d.items)?d.items:[],notes:d.notes||""}}
  document.addEventListener("click",function(e){const b=e.target.closest("[data-hardware-document]");if(!b)return;e.preventDefault();e.stopImmediatePropagation();let row={};try{row=JSON.parse(decodeURIComponent(b.dataset.payload||"%7B%7D"))}catch{}const kind=b.dataset.hardwareDocument||"invoice";if(b.dataset.documentId||b.dataset.documentNo)openSaved({id:b.dataset.documentId,documentNo:b.dataset.documentNo},b.dataset.print==="true");else openDocument(normalize(kind,row),b.dataset.print==="true")},true);
  window.AxtorHardwareDocuments={template,openDocument,openSaved,normalize};
})();
