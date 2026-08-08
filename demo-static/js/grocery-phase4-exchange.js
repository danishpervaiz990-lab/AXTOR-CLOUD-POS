"use strict";

function exchangeItemsJson(value,label){
  let parsed;
  try{parsed=JSON.parse(String(value||"[]"));}catch{throw new Error(`${label} must be valid JSON`);}
  if(!Array.isArray(parsed)||!parsed.length)throw new Error(`${label} must contain at least one line`);
  return parsed;
}
function openExchange40(){
  document.body.insertAdjacentHTML("beforeend",modal("exchange40-modal","New Invoice-Linked Exchange",`<form id="exchange40-form" class="form-grid"><div class="notice-ok">The backend validates eligible sold quantity, requires a return reason, posts the return first, restores stock/accounting, then creates the replacement sale with an idempotent exchange workflow.</div><div class="field"><label>Original invoice ID *</label><input name="sourceSalesDocumentId" required placeholder="Sales document ID"></div><div class="field"><label>Return reason *</label><input name="reason" required placeholder="Damaged / wrong item / customer exchange"></div><div class="field"><label>Return items JSON *</label><textarea name="returnItems" required rows="7" placeholder='[{"productId":"...","returnQty":1}]'></textarea><small>Use eligible product IDs and quantities from the original invoice.</small></div><div class="field"><label>Replacement items JSON *</label><textarea name="replacementItems" required rows="7" placeholder='[{"productId":"...","quantity":1,"unitPrice":10}]'></textarea></div><div class="field"><label>Replacement payment method</label><select name="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="credit">Customer Account / Credit</option><option value="mixed">Mixed</option></select></div><div class="field"><label>Paid amount</label><input name="paidAmount" inputmode="decimal" value="0"></div><div class="field"><label>Notes</label><textarea name="notes" rows="3"></textarea></div><button class="button button-primary">Post Exchange</button></form>`));
  bindModals();
  document.getElementById("exchange40-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,o=fdObj(form);const button=form.querySelector("button");button.disabled=true;
    try{
      const payload={sourceSalesDocumentId:String(o.sourceSalesDocumentId||"").trim(),reason:String(o.reason||"").trim(),returnItems:exchangeItemsJson(o.returnItems,"Return items"),replacementItems:exchangeItemsJson(o.replacementItems,"Replacement items"),paymentMethod:o.paymentMethod,paidAmount:num(o.paidAmount),notes:o.notes};
      const d=unwrap(await post("/api/v1/grocery/exchanges",payload,{"Idempotency-Key":key()}));
      alert(`Exchange posted${d?.replacementSale?.documentNo?` · replacement ${d.replacementSale.documentNo}`:""}`);
      document.getElementById("exchange40-modal")?.remove();returns40();
    }catch(x){form.insertAdjacentHTML("afterbegin",notice(x.message,true));}finally{button.disabled=false;}
  });
}

document.addEventListener("click",e=>{
  const button=e.target?.closest?.("#exchange40");
  if(!button)return;
  e.preventDefault();e.stopImmediatePropagation();openExchange40();
},true);
