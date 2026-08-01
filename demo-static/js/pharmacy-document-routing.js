(function(){
"use strict";
const CACHE_KEY="axtor.pharmacy.invoice.settings";
const templateMap={a4:"modern-a4",thermal80:"thermal-80",thermal58:"thermal-58"};
function settings(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}")||{}}catch{return {}}}
function encode(value){return btoa(unescape(encodeURIComponent(JSON.stringify(value))))}
function documentUrl(record,options={}){const cfg=settings();const template=templateMap[cfg.defaultPrintSize]||"modern-a4";if(record?.id&&!options.forcePayload)return `invoice-view.html?id=${encodeURIComponent(record.id)}&template=${encodeURIComponent(template)}&industry=pharmacy`;
const data=record?.data&&typeof record.data==="object"?record.data:record||{};const payload={template,documentType:options.documentType||data.documentType||"invoice",documentNo:data.documentNo||data.invoiceNo||data.referenceNo||record?.referenceNo||"",date:data.issuedAt||data.createdAt||record?.createdAt||new Date().toISOString(),customerName:data.patientName||data.customerName||data.patientReference||"Walk-in Patient",pharmacist:cfg.showPharmacist!==false?(data.pharmacistName||data.pharmacist||""):"",prescriptionReference:cfg.showPrescriptionReference!==false?(data.prescriptionReference||data.prescriptionNo||""):"",items:(data.items||data.lines||[]).map(i=>({name:i.name||i.productName||i.medicineName||i.description||"Medicine",quantity:i.quantity||i.qty||1,unit:i.unit||"pc",price:i.price||i.unitPrice||0,total:i.total||i.lineTotal||0,batchNo:cfg.showBatchExpiry!==false?(i.batchNo||""):"",expiryDate:cfg.showBatchExpiry!==false?(i.expiryDate||""):""})),subtotal:data.subtotal||data.total||0,total:data.total||data.refundAmount||0,paymentMethod:data.paymentMethod||data.refundMethod||"",footer:cfg.footer||""};return `invoice-view.html?data=${encodeURIComponent(encode(payload))}&industry=pharmacy`}
function openDocument(record,options={}){window.open(documentUrl(record,options),options.target||"_blank","noopener")}
function bind(){document.addEventListener("click",e=>{const el=e.target.closest("[data-pharmacy-document-id],[data-pharmacy-print-record]");if(!el)return;e.preventDefault();e.stopImmediatePropagation();if(el.dataset.pharmacyDocumentId){openDocument({id:el.dataset.pharmacyDocumentId});return}try{openDocument(JSON.parse(el.dataset.pharmacyPrintRecord||"{}"),{forcePayload:true,documentType:el.dataset.documentType||"invoice"})}catch(err){console.error("Unable to open Pharmacy document",err)}},true)}
window.AxtorPharmacyDocuments={documentUrl,openDocument};
document.addEventListener("DOMContentLoaded",bind);
})();
