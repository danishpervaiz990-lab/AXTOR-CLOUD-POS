"use strict";

// Runtime corrections kept separate so the phase-2 implementation remains reviewable.
vanStockView=async function(id){
  try{
    const list=unwrap(await get(`/api/v1/grocery/vans/${id}/stock`))||[];
    document.body.insertAdjacentHTML("beforeend",modal("van-stock-modal","Van Stock",`${table(["SKU","Product","Quantity"],list.map(x=>`<tr><td>${esc(x.sku||'—')}</td><td>${esc(x.productName)}</td><td>${num(x.qty)}</td></tr>`).join(''))}<div class="button-row"><button class="button button-primary" id="van-new-sale">Van Sale</button><button class="button button-secondary" id="van-collection">Customer Collection</button><button class="button button-secondary" id="van-return">Van Return</button></div>`));
    bindModals();
    document.getElementById("van-new-sale")?.addEventListener("click",()=>vanSaleModalV2(id,list));
    document.getElementById("van-collection")?.addEventListener("click",()=>vanCollectionModal(id));
    document.getElementById("van-return")?.addEventListener("click",()=>vanReturnModalV2(id,list));
  }catch(e){alert(e.message);}
};

function vanProductOptions(stock){return `<option value="">Select</option>${stock.map(x=>`<option value="${esc(x.productId)}">${esc(x.productName)} · ${num(x.qty)}</option>`).join('')}`;}
function vanSaleModalV2(id,stock){
  document.body.insertAdjacentHTML("beforeend",modal("van-sale-modal","Van Sale",`<form id="van-sale-form" class="form-grid form-two"><div class="field"><label>Product *</label><select name="productId" required>${vanProductOptions(stock)}</select></div><div class="field"><label>Quantity *</label><input name="qty" required inputmode="decimal" value="1"></div><div class="field"><label>Unit price *</label><input name="unitPrice" required inputmode="decimal"></div><div class="field"><label>Payment method</label><select name="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="credit">Credit</option></select></div><div class="field"><label>Paid amount</label><input name="paidAmount" inputmode="decimal"></div><div class="field"><label>Customer ID for credit</label><input name="customerId"></div><button class="button button-primary span-two">Post Van Sale</button></form>`));
  bindModals();
  document.getElementById("van-sale-form")?.addEventListener("submit",async e=>{e.preventDefault();const o=fdObj(e.currentTarget);try{await post(`/api/v1/grocery/vans/${id}/sales`,{customerId:o.customerId||undefined,paymentMethod:o.paymentMethod,paidAmount:o.paidAmount===""?undefined:num(o.paidAmount),items:[{productId:o.productId,qty:num(o.qty),unitPrice:num(o.unitPrice)}]});document.getElementById("van-sale-modal")?.remove();document.getElementById("van-stock-modal")?.remove();render();}catch(x){e.currentTarget.insertAdjacentHTML("afterbegin",notice(x.message,true));}});
}
function vanReturnModalV2(id,stock){
  document.body.insertAdjacentHTML("beforeend",modal("van-return-modal","Van Return",`<form id="van-return-form" class="form-grid"><div class="field"><label>Product *</label><select name="productId" required>${vanProductOptions(stock)}</select></div><div class="field"><label>Quantity *</label><input name="qty" required inputmode="decimal"></div><div class="field"><label>Reason *</label><input name="reason" required></div><button class="button button-primary">Post Return</button></form>`));
  bindModals();
  document.getElementById("van-return-form")?.addEventListener("submit",async e=>{e.preventDefault();const o=fdObj(e.currentTarget);try{await post(`/api/v1/grocery/vans/${id}/returns`,{reason:o.reason,items:[{productId:o.productId,qty:num(o.qty)}]});document.getElementById("van-return-modal")?.remove();document.getElementById("van-stock-modal")?.remove();render();}catch(x){e.currentTarget.insertAdjacentHTML("afterbegin",notice(x.message,true));}});
}
