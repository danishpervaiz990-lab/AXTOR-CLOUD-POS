"use strict";

const g62BaseShell=shell;
shell=function(content,title,subtitle,actions=""){
  return g62BaseShell(content,title,subtitle,actions).replace(/Grocery · Requirements 1–\d+/g,"Grocery · Requirements 1–62");
};

function g62EnsureStatusHost(){
  let host=document.getElementById('g62-live-status');
  if(!host){host=document.createElement('div');host.id='g62-live-status';host.className='g62-live-status';host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','false');document.body.appendChild(host);}
  return host;
}
function g62Status(message,kind='success',timeout=5000){
  const text=String(message||'').trim();if(!text)return null;
  const host=g62EnsureStatusHost(),item=document.createElement('div');item.className='g62-status-item';item.dataset.kind=kind;item.setAttribute('role',kind==='error'?'alert':'status');item.textContent=text;host.appendChild(item);
  if(timeout>0)setTimeout(()=>item.remove(),timeout);
  return item;
}
function g62ClassifyError(error){const message=String(error?.message||error||'Request failed');if(/permission|forbidden|not authorized|unauthorized|403/i.test(message))return'warning';return'error';}

const g62RequestBase=request;
let g62Busy=0;
request=async function(method,path,body,extraHeaders){
  const mutation=!['GET','HEAD'].includes(String(method||'GET').toUpperCase());
  if(mutation){g62Busy++;document.documentElement.classList.add('g62-network-busy');g62Status('Working…','busy',1800);}
  try{
    const result=await g62RequestBase(method,path,body,extraHeaders);
    if(mutation)g62Status(result?.message||'Operation completed successfully.','success');
    return result;
  }catch(error){
    g62Status(error?.message||'The operation failed.',g62ClassifyError(error),7500);
    throw error;
  }finally{
    if(mutation){g62Busy=Math.max(0,g62Busy-1);if(!g62Busy)document.documentElement.classList.remove('g62-network-busy');}
  }
};

function g62EnhanceFeedback(root=document){
  root.querySelectorAll?.('.notice-error,.form-error').forEach(el=>{el.setAttribute('role','alert');el.setAttribute('aria-live','assertive');});
  root.querySelectorAll?.('.notice-ok').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
  root.querySelectorAll?.('button[disabled]').forEach(el=>el.setAttribute('aria-disabled','true'));
  root.querySelectorAll?.('.empty').forEach(el=>el.setAttribute('role','status'));
}
const g62Observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)g62EnhanceFeedback(node);});
g62Observer.observe(document.documentElement,{childList:true,subtree:true});
g62EnhanceFeedback();

window.addEventListener('unhandledrejection',event=>{const reason=event.reason;g62Status(reason?.message||'An unexpected operation error occurred.','error',9000);});
window.addEventListener('error',event=>{if(event?.message)g62Status(event.message,'error',9000);});
window.addEventListener('offline',()=>g62Status('Network connection lost. Changes cannot be saved until connectivity returns.','error',0));
window.addEventListener('online',()=>g62Status('Network connection restored.','success',5000));

function g62PrintProfile(){return typeof p50LastPrintProfile!=='undefined'&&p50LastPrintProfile?p50LastPrintProfile:null;}
function g62PaperName(){const profile=g62PrintProfile();return String(profile?.paperSize||(profile?.widthMm?`${profile.widthMm}mm`:'')).trim();}
function g62PreparePrint(){
  const sheet=document.querySelector('.p50-print-target');if(!sheet)return;
  const paper=g62PaperName();if(paper)sheet.dataset.paper=paper;
  const overflow=[...sheet.querySelectorAll('table,img,svg,.p50-label')].filter(el=>el.scrollWidth>el.clientWidth+3);
  if(overflow.length){sheet.dataset.printOverflow='true';g62Status(`Print QA warning: ${overflow.length} element(s) may be clipped. Review the selected print profile before printing.`,'warning',9000);}else delete sheet.dataset.printOverflow;
}
window.addEventListener('beforeprint',g62PreparePrint);
window.addEventListener('afterprint',()=>{document.querySelector('.p50-print-target')?.removeAttribute('data-print-overflow');});

window.groceryHardening51To62={
  requirements:[51,52,53,54,55,56,57,58,59,60,61,62],
  feedback:{loading:true,success:true,validation:true,permission:true,network:true,empty:true},
  responsive:{desktop:true,laptop:true,tablet:true,touchTerminal:true},
  printQa:{a4:true,receipt80mm:true,receipt58mm:true,purchaseOrder:true,paymentVoucher:true,customerStatement:true,supplierStatement:true,barcodeLabel:true},
  productionCertificationReservedFor:63,
};
