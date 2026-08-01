(function(){
"use strict";
function profile(){return window.AxtorPaintPrintSettings?.getProfile?.()||{outputProfile:"a4",density:"standard",fields:{}}}
function encode(data){return btoa(unescape(encodeURIComponent(JSON.stringify(data))))}
function urlFor(record,type){const p=profile(),q=new URLSearchParams();q.set("data",encode(Object.assign({template:p.outputProfile==="thermal-80"?"thermal-80":p.outputProfile==="thermal-58"?"thermal-58":"modern-a4",documentType:type||"paint_document",printProfile:p.outputProfile,printDensity:p.density},record||{})));return "invoice-view.html?"+q.toString()}
function normalizeMix(job){return {documentNo:job.jobNo||job.mixJobNo||job.id,title:"Paint Mix Job",customerName:job.customerReference||"Walk-in Customer",issuedAt:job.completedAt||job.createdAt||new Date().toISOString(),items:[{name:[job.colorCode,job.colorName].filter(Boolean).join(" · ")||"Custom paint mix",description:[job.formulaCode||job.formulaReference,job.baseCode,job.packSize&&String(job.packSize)+" "+(job.unit||"")].filter(Boolean).join(" · "),quantity:job.quantity||1,unit:job.unit||"can",unitPrice:job.sellingPrice||0,total:job.sellingPrice||0}],total:job.sellingPrice||0,industryFields:{colourCode:job.colorCode,formulaReference:job.formulaCode||job.formulaReference,base:job.baseCode,packSize:job.packSize,mixJobReference:job.jobNo||job.id,batch:job.batchNo,qualityApproval:job.qualityStatus||job.qualityResult,projectReference:job.vehicleProjectReference}}}
function openRecord(record,type){window.open(urlFor(type==="mix_job"?normalizeMix(record):record,type),"_blank","noopener")}
window.AxtorPaintDocuments={profile:profile,urlFor:urlFor,normalizeMix:normalizeMix,openRecord:openRecord};
document.addEventListener("click",function(e){const b=e.target.closest("[data-paint-print]");if(!b)return;e.preventDefault();let record={};try{record=JSON.parse(b.dataset.paintPayload||"{}") }catch(_){}openRecord(record,b.dataset.paintPrint||"paint_document")},true);
})();
