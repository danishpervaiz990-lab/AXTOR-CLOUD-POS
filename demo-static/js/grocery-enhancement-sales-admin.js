"use strict";

const g7SalesState={page:1,pageSize:25,last:null,queue:null};

function g7DocTypeLabel(type){
  const raw=String(type||"");
  if(raw==="DELIVERY_NOTE")return "Delivery Note";
  return raw.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function g7DocStatusOptions(value){
  return ["","DRAFT","ISSUED","PARTIALLY_PAID","PAID","CANCELLED","VOID"].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x||'All statuses'}</option>`).join("");
}
function g7PaymentStatusOptions(value){
  return ["","unpaid","partially_paid","paid"].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x?x.replaceAll('_',' '):'All payment states'}</option>`).join("");
}
function g7DocLine(options){
  return `<div class="g7-uom-row" data-g7-doc-line><div class="field"><label>Product *</label><select data-g7-doc="productId" required>${options}</select></div><div class="field"><label>Quantity *</label><input data-g7-doc="quantity" inputmode="decimal" value="1" required></div><div class="field"><label>Unit price *</label><input data-g7-doc="unitPrice" inputmode="decimal" value="0" required></div><button type="button" class="button button-secondary" data-g7-remove-line>Remove</button></div>`;
}

async function g7NewSalesDocument(type="QUOTATION"){
  try{
    const [pd,cd]=await Promise.all([get("/api/v1/products?limit=500"),get("/api/v1/customers?limit=500")]);
    const products=rows(pd,["products","items"]),customers=rows(cd,["customers","items"]),target=String(type||"QUOTATION").toUpperCase();
    const sequence=target==="DELIVERY_NOTE"?"delivery_note":target.toLowerCase();
    let preview="Auto on save";
    try{preview=unwrap(await get(`/api/v1/grocery/enhancement/numbering/${sequence}/preview`))?.preview||preview;}catch(_){}
    const productOptions=`<option value="">Select</option>${products.map(x=>`<option value="${esc(x.id)}" data-price="${esc(num(x.price))}">${esc(x.name)} · ${esc(x.sku||x.itemCode||'')}</option>`).join("")}`;
    const customerOptions=customers.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}${x.code?` · ${esc(x.code)}`:''}</option>`).join("");
    const body=`<form id="g7-doc-form" class="form-grid form-two">
      <div class="field"><label>Document number</label><div class="g7-code-preview">${esc(preview)}</div><small>Automatically allocated by the backend on save.</small></div>
      <div class="field"><label>Customer</label><select name="customerId"><option value="">Walk-in / none</option>${customerOptions}</select></div>
      <div class="field"><label>Due date</label><input type="date" name="dueDate"></div>
      <div class="field"><label>Reference</label><input name="referenceNo"></div>
      <div class="field span-two"><label>Customer notes</label><textarea name="customerNotes"></textarea></div>
      <div class="span-two"><div class="panel-head"><h3>Lines</h3><button type="button" class="button button-secondary" id="g7-add-doc-line">+ Line</button></div><div id="g7-doc-lines">${g7DocLine(productOptions)}</div></div>
      <div class="span-two notice-ok">The document is created as a <strong>draft</strong>. Stock and financial posting are not duplicated by draft creation or conversion.</div>
      <div class="span-two g7-submit-row"><button class="button button-primary">Create Draft ${esc(g7DocTypeLabel(target))}</button></div>
    </form>`;
    document.body.insertAdjacentHTML("beforeend",modal("g7-doc-modal",`New ${g7DocTypeLabel(target)}`,body));
    bindModals();
    const form=document.getElementById("g7-doc-form"),lines=document.getElementById("g7-doc-lines");
    document.getElementById("g7-add-doc-line")?.addEventListener("click",()=>lines?.insertAdjacentHTML("beforeend",g7DocLine(productOptions)));
    lines?.addEventListener("click",event=>{
      const button=event.target.closest?.("[data-g7-remove-line]");
      if(button&&lines.querySelectorAll("[data-g7-doc-line]").length>1)button.closest("[data-g7-doc-line]")?.remove();
    });
    lines?.addEventListener("change",event=>{
      const select=event.target.closest?.('[data-g7-doc="productId"]');
      if(!select)return;
      const line=select.closest("[data-g7-doc-line]"),price=line?.querySelector('[data-g7-doc="unitPrice"]');
      if(price)price.value=select.selectedOptions[0]?.dataset.price||"0";
    });
    form?.addEventListener("submit",async event=>{
      event.preventDefault();
      const o=fdObj(form);
      const items=[...form.querySelectorAll("[data-g7-doc-line]")].map(line=>({
        productId:line.querySelector('[data-g7-doc="productId"]')?.value,
        quantity:Math.max(.001,num(line.querySelector('[data-g7-doc="quantity"]')?.value,1)),
        unitPrice:Math.max(0,num(line.querySelector('[data-g7-doc="unitPrice"]')?.value))
      })).filter(x=>x.productId);
      if(!items.length){form.insertAdjacentHTML("afterbegin",notice("Add at least one product line.",true));return;}
      try{
        await post("/api/v1/sales-documents",{documentType:target.toLowerCase(),postingMode:"draft",customerId:o.customerId||undefined,dueDate:o.dueDate||undefined,referenceNo:o.referenceNo||undefined,customerNotes:o.customerNotes||undefined,items},{"Idempotency-Key":key()});
        document.getElementById("g7-doc-modal")?.remove();
        g7Status(`${g7DocTypeLabel(target)} draft created.`,"success");
        g7SalesAdministration();
      }catch(error){form.insertAdjacentHTML("afterbegin",notice(error.message,true));}
    });
  }catch(error){alert(error.message);}
}

function g7SalesFilterParams(form){
  const o=form?fdObj(form):(state.query||{}),params=new URLSearchParams();
  for(const keyName of ["q","documentType","status","paymentStatus","branchId","salesmanId","from","to"]){if(o[keyName])params.set(keyName,o[keyName]);}
  params.set("page",String(g7SalesState.page));params.set("pageSize",String(g7SalesState.pageSize));return params;
}
function g7SalesRow(x){
  const actions=[`<button class="button button-secondary button-small" data-g7-doc-view="${esc(x.id)}">View</button>`];
  if(can("sales_documents.change_document_type")&&x.documentType==="QUOTATION"){
    actions.push(`<button class="button button-secondary button-small" data-g7-convert="${esc(x.id)}" data-target="DELIVERY_NOTE">→ DN</button>`);
    actions.push(`<button class="button button-primary button-small" data-g7-convert="${esc(x.id)}" data-target="INVOICE">→ Invoice</button>`);
  }else if(can("sales_documents.change_document_type")&&x.documentType==="DELIVERY_NOTE"){
    actions.push(`<button class="button button-primary button-small" data-g7-convert="${esc(x.id)}" data-target="INVOICE">→ Invoice</button>`);
  }
  return `<tr><td><strong>${esc(x.documentNo)}</strong><small class="g7-doc-type">${esc(g7DocTypeLabel(x.documentType))}</small></td><td>${date(x.issuedAt)}</td><td>${esc(x.customerName||'Walk-in')}</td><td>${esc(x.salesmanName||'—')}</td><td>${money(x.total,x.currency)}</td><td>${pill(x.status)}</td><td>${pill(x.paymentStatus||'unpaid')}</td><td>${pill(x.creditStatus||'—')}</td><td><div class="g7-actions">${actions.join("")}</div></td></tr>`;
}

async function g7DocumentDetail(id){
  try{
    const d=unwrap(await get(`/api/v1/grocery/sales-admin/documents/${encodeURIComponent(id)}`)),items=d.items||[];
    const detail=`<div class="g7-modal-detail"><div><strong>Type</strong>${esc(g7DocTypeLabel(d.documentType))}</div><div><strong>Status</strong>${esc(d.status)}</div><div><strong>Customer</strong>${esc(d.customerName||'Walk-in')}</div><div><strong>Salesperson</strong>${esc(d.salesmanName||'—')}</div><div><strong>Issued</strong>${date(d.issuedAt)}</div><div><strong>Due</strong>${date(d.dueDate)}</div><div><strong>Total</strong>${money(d.total,d.currency)}</div><div><strong>Balance</strong>${money(d.balance,d.currency)}</div></div>`;
    const lines=table(["SKU","Product","Qty","Rate","Discount","Tax","Total"],items.map(x=>`<tr><td>${esc(x.sku||'—')}</td><td>${esc(x.name||x.description||'—')}</td><td>${num(x.qty)}</td><td>${money(x.rate,d.currency)}</td><td>${money(x.discount,d.currency)}</td><td>${money(x.tax,d.currency)}</td><td>${money(x.total,d.currency)}</td></tr>`).join(""));
    const notes=d.customerNotes?`<section class="panel"><strong>Customer notes</strong><p>${esc(d.customerNotes)}</p></section>`:"";
    document.body.insertAdjacentHTML("beforeend",modal("g7-doc-detail",d.documentNo||"Sales Document",`${detail}<section class="panel"><h3>Lines</h3>${lines}</section>${notes}`));
    bindModals();
  }catch(error){alert(error.message);}
}
async function g7ConvertDocument(id,target){
  if(!confirm(`Create a new ${g7DocTypeLabel(target)} draft from this source document? The original remains unchanged and conversion history will be linked.`))return;
  try{await post(`/api/v1/grocery/sales-admin/documents/${encodeURIComponent(id)}/convert`,{targetType:target},{"Idempotency-Key":key()});g7Status(`Converted to ${g7DocTypeLabel(target)} draft.`,"success");g7SalesAdministration();}catch(error){alert(error.message);}
}

function g7HeldDetail(row){
  const d=row?.data||{},items=d.items||[];
  const detail=`<div class="g7-modal-detail"><div><strong>Status</strong>${esc(row.status)}</div><div><strong>Amount</strong>${money(row.amount,row.currency)}</div><div><strong>Held by</strong>${esc(row.heldByUserId||'—')}</div><div><strong>Held at</strong>${date(row.heldAt)}</div><div><strong>Customer</strong>${esc(row.customerId||'Walk-in')}</div><div><strong>Approval</strong>${esc(d.heldApprovalStatus||d.creditApprovalStatus||'pending / not decided')}</div></div>`;
  const lines=table(["Product","Qty","Price"],items.map(x=>`<tr><td>${esc(x.name||x.productName||x.sku||x.productId||'—')}</td><td>${num(x.qty??x.quantity??x.saleQty,1)}</td><td>${money(x.price??x.unitPrice??x.rate,row.currency)}</td></tr>`).join(""));
  const reason=d.heldDecisionReason||d.creditApprovalReason?`<section class="panel"><strong>Decision reason</strong><p>${esc(d.heldDecisionReason||d.creditApprovalReason)}</p></section>`:"";
  document.body.insertAdjacentHTML("beforeend",modal("g7-held-detail",row.referenceNo||"Held Sale",`${detail}<section class="panel"><h3>Cart</h3>${lines}</section>${reason}`));
  bindModals();
}
async function g7HeldDecision(row,decision){
  const reason=prompt(`${decision==='approved'?'Approval':'Rejection'} reason (required)`);if(reason===null)return;if(!reason.trim()){alert("Reason is required.");return;}
  try{await post(`/api/v1/grocery/sales-admin/held/${encodeURIComponent(row.id)}/${decision==='approved'?'approve':'reject'}`,{reason:reason.trim()});g7Status(`Held sale ${decision}.`,"success");g7ApprovalQueue();}catch(error){alert(error.message);}
}
async function g7CreditRequest(row){
  const reason=prompt("Why is a credit override required? This request will include the live credit exposure snapshot.");if(reason===null)return;
  try{await post("/api/v1/grocery/sales-admin/credit-overrides",{heldSaleId:row.id,customerId:row.customerId,invoiceAmount:row.amount,reason:reason.trim()||undefined});g7Status("Credit override request submitted.","success");g7ApprovalQueue();}catch(error){alert(error.message);}
}
async function g7CreditDecision(row,decision){
  const reason=prompt(`${decision==='approved'?'Approval':'Rejection'} reason (required)`);if(reason===null)return;if(!reason.trim()){alert("Reason is required.");return;}
  try{await post(`/api/v1/grocery/sales-admin/credit-overrides/${encodeURIComponent(row.id)}/${decision==='approved'?'approve':'reject'}`,{reason:reason.trim()});g7Status(`Credit override ${decision}.`,"success");g7ApprovalQueue();}catch(error){alert(error.message);}
}
async function g7ResumeHeld(row,canApprove){
  const data=row.data||{},creditState=String(data.creditApprovalStatus||"").toLowerCase();
  if(creditState&&creditState!=="approved"&&!canApprove){alert("This held sale has a credit override request that is not approved.");return;}
  try{
    state.cart=Array.isArray(data.items)?data.items:[];state.payments=Array.isArray(data.payments)?data.payments:[];state.invoiceDiscount=num(data.invoiceDiscount);state.notes=data.notes||"";
    state.creditOverrideReason=data.creditApprovalReason||data.heldDecisionReason||(creditState==="approved"?`Approved credit override for ${row.referenceNo}`:"");
    if(row.customerId){const overview=unwrap(await get(`/api/v1/grocery/customers/${encodeURIComponent(row.customerId)}/overview`));state.selectedCustomer=overview?.customer||null;}else state.selectedCustomer=null;
    await del(`/api/v1/grocery/held-sales/${encodeURIComponent(row.id)}`,{status:"recalled"});navigate("checkout");
  }catch(error){alert(error.message);}
}
function g7HeldApprovalRow(x,canApprove){
  const d=x.data||{},credit=String(d.creditApprovalStatus||"").toLowerCase(),actions=[];
  actions.push(`<button class="button button-secondary button-small" data-g7-held-view="${esc(x.id)}">Inspect</button>`);
  if(x.customerId&&!credit)actions.push(`<button class="button button-secondary button-small" data-g7-credit-request="${esc(x.id)}">Request Credit Override</button>`);
  if(canApprove){actions.push(`<button class="button button-secondary button-small" data-g7-held-approve="${esc(x.id)}">Approve Hold</button>`);actions.push(`<button class="button button-secondary button-small" data-g7-held-reject="${esc(x.id)}">Reject</button>`);actions.push(`<button class="button button-primary button-small" data-g7-held-resume="${esc(x.id)}">Resume</button>`);}
  return `<tr><td>${esc(x.referenceNo||x.id)}</td><td>${date(x.heldAt)}</td><td>${esc(x.customerId||'Walk-in')}</td><td>${money(x.amount,x.currency)}</td><td>${pill(x.status)}</td><td><div class="g7-actions">${actions.join("")}</div></td></tr>`;
}
function g7CreditApprovalRow(x,canApprove){
  const s=x.snapshot||{},actions=canApprove&&x.status==="pending"?`<button class="button button-primary button-small" data-g7-credit-approve="${esc(x.id)}">Approve</button><button class="button button-secondary button-small" data-g7-credit-reject="${esc(x.id)}">Reject</button>`:`<span class="g7-approval-reason">${esc(x.decisionNote||'—')}</span>`;
  return `<tr><td><strong>${esc(x.requestNo)}</strong><small>${date(x.createdAt)}</small></td><td>${esc(s.customer?.name||'—')}<small>Outstanding ${money(s.outstandingBalance)} · Limit ${money(s.creditLimit)} · Overdue ${money(s.overdueAmount)} · Oldest ${date(s.oldestDueDate)}</small></td><td>${money(s.newInvoiceAmount||x.amount)}<small>Projected ${money(s.projectedExposure)}</small></td><td>${esc((s.blockedReasons||[]).join(', ')||'—')}<small>Terms ${num(s.creditTermDays)} days</small></td><td>${pill(x.status)}</td><td><div class="g7-actions">${actions}</div></td></tr>`;
}

async function g7ApprovalQueue(){
  loading("Sales Approval Queue","Held sales and credit exceptions requiring authorized action");
  try{
    const q=unwrap(await get("/api/v1/grocery/sales-admin/approvals"));g7SalesState.queue=q;
    const held=q.heldSales||[],credits=q.creditOverrides||[];
    const body=`<div class="g7-tabs"><button class="g7-tab" id="g7-approval-docs">Documents</button><button class="g7-tab active">Approval Queue</button></div>
      <section class="metric-row">${metric("Held sales",String(held.length))}${metric("Credit requests",String(credits.length))}${metric("Approver",q.canApprove?'Authorized':'View / request only')}</section>
      <section class="panel"><div class="panel-head"><div><h2>Held Sales</h2><p class="muted">Held is not the same as approved. Decision identity, timestamp and reason are persisted server-side.</p></div></div>${table(["Reference","Held","Customer","Amount","Status","Action"],held.map(x=>g7HeldApprovalRow(x,q.canApprove)).join(""))}</section>
      <section class="panel"><div class="panel-head"><div><h2>Credit Limit / Term Overrides</h2><p class="muted">Approvers see the live exposure snapshot captured at request time. Client flags cannot approve a request.</p></div></div>${table(["Request","Customer / exposure","Invoice","Blocked reason","Status","Decision"],credits.map(x=>g7CreditApprovalRow(x,q.canApprove)).join(""))}</section>`;
    app.innerHTML=shell(body,"Sales Approval Queue",`${held.length+credits.filter(x=>x.status==='pending').length} item(s) visible`);
    bindShell();
    document.getElementById("g7-approval-docs")?.addEventListener("click",()=>{state.query={};g7SalesAdministration();});
    const heldBy=id=>held.find(x=>x.id===id),creditBy=id=>credits.find(x=>x.id===id);
    document.querySelectorAll("[data-g7-held-view]").forEach(b=>b.addEventListener("click",()=>g7HeldDetail(heldBy(b.dataset.g7HeldView))));
    document.querySelectorAll("[data-g7-credit-request]").forEach(b=>b.addEventListener("click",()=>g7CreditRequest(heldBy(b.dataset.g7CreditRequest))));
    document.querySelectorAll("[data-g7-held-approve]").forEach(b=>b.addEventListener("click",()=>g7HeldDecision(heldBy(b.dataset.g7HeldApprove),"approved")));
    document.querySelectorAll("[data-g7-held-reject]").forEach(b=>b.addEventListener("click",()=>g7HeldDecision(heldBy(b.dataset.g7HeldReject),"rejected")));
    document.querySelectorAll("[data-g7-held-resume]").forEach(b=>b.addEventListener("click",()=>g7ResumeHeld(heldBy(b.dataset.g7HeldResume),q.canApprove)));
    document.querySelectorAll("[data-g7-credit-approve]").forEach(b=>b.addEventListener("click",()=>g7CreditDecision(creditBy(b.dataset.g7CreditApprove),"approved")));
    document.querySelectorAll("[data-g7-credit-reject]").forEach(b=>b.addEventListener("click",()=>g7CreditDecision(creditBy(b.dataset.g7CreditReject),"rejected")));
  }catch(error){renderError("Sales Approval Queue",error);}
}

async function g7SalesAdministration(){
  loading("Sales Administration","Invoices, quotations, delivery notes and document conversion");
  try{
    const params=g7SalesFilterParams(),d=unwrap(await get(`/api/v1/grocery/sales-admin/documents?${params.toString()}`));g7SalesState.last=d;
    const pg=d.pagination||{},branches=state.context?.branches||[],salesmen=state.context?.salesmen||[];
    const branchOptions=branches.map(x=>`<option value="${esc(x.id)}" ${state.query?.branchId===x.id?'selected':''}>${esc(x.name)}</option>`).join("");
    const salesmanOptions=salesmen.map(x=>`<option value="${esc(x.id)}" ${state.query?.salesmanId===x.id?'selected':''}>${esc(x.name)}</option>`).join("");
    const filters=`<form id="g7-sales-filter" class="g7-toolbar"><div class="field g7-search"><label>Search</label><input name="q" value="${esc(state.query?.q||'')}" placeholder="Document, customer, salesperson, reference"></div><div class="field"><label>Type</label><select name="documentType"><option value="">All</option>${["INVOICE","QUOTATION","DELIVERY_NOTE"].map(x=>`<option value="${x}" ${state.query?.documentType===x?'selected':''}>${esc(g7DocTypeLabel(x))}</option>`).join("")}</select></div><div class="field"><label>Status</label><select name="status">${g7DocStatusOptions(state.query?.status||'')}</select></div><div class="field"><label>Payment</label><select name="paymentStatus">${g7PaymentStatusOptions(state.query?.paymentStatus||'')}</select></div><div class="field"><label>Branch</label><select name="branchId"><option value="">All</option>${branchOptions}</select></div><div class="field"><label>Salesperson</label><select name="salesmanId"><option value="">All</option>${salesmanOptions}</select></div><div class="field"><label>From</label><input type="date" name="from" value="${esc(state.query?.from||'')}"></div><div class="field"><label>To</label><input type="date" name="to" value="${esc(state.query?.to||'')}"></div><button class="button button-primary">Filter</button></form>`;
    const body=`<div class="g7-tabs"><button class="g7-tab active">Documents</button><button class="g7-tab" id="g7-open-approvals">Approval Queue</button></div><section class="panel"><div class="panel-head"><div><h2>Sales Documents</h2><p class="muted">Real tenant records with server-side filtering and pagination.</p></div><div class="g7-actions"><button id="g7-new-quotation" class="button button-secondary">+ Quotation</button><button id="g7-new-dn" class="button button-secondary">+ Delivery Note</button><button id="g7-new-invoice" class="button button-primary">+ Invoice Draft</button></div></div>${filters}</section><section class="panel"><div class="g7-scroll-table">${table(["Document","Date","Customer","Salesperson","Amount","Status","Payment","Credit","Action"],(d.rows||[]).map(g7SalesRow).join(""))}</div><div class="g7-pagination"><span>Page ${pg.page||1} of ${pg.totalPages||1} · ${pg.total||0} documents</span><div class="g7-actions"><button id="g7-prev-page" class="button button-secondary" ${pg.page<=1?'disabled':''}>Previous</button><button id="g7-next-page" class="button button-secondary" ${pg.page>=pg.totalPages?'disabled':''}>Next</button></div></div></section>`;
    app.innerHTML=shell(body,"Sales Administration",`${pg.total||0} sales documents`,`<button class="button button-secondary" id="g7-header-approvals">Approval Queue</button>`);
    bindShell();
    document.getElementById("g7-sales-filter")?.addEventListener("submit",event=>{event.preventDefault();g7SalesState.page=1;state.query=fdObj(event.currentTarget);g7SalesAdministration();});
    document.getElementById("g7-prev-page")?.addEventListener("click",()=>{g7SalesState.page=Math.max(1,g7SalesState.page-1);g7SalesAdministration();});
    document.getElementById("g7-next-page")?.addEventListener("click",()=>{g7SalesState.page=Math.min(pg.totalPages||1,g7SalesState.page+1);g7SalesAdministration();});
    document.getElementById("g7-open-approvals")?.addEventListener("click",g7ApprovalQueue);document.getElementById("g7-header-approvals")?.addEventListener("click",g7ApprovalQueue);
    document.querySelectorAll("[data-g7-doc-view]").forEach(b=>b.addEventListener("click",()=>g7DocumentDetail(b.dataset.g7DocView)));
    document.querySelectorAll("[data-g7-convert]").forEach(b=>b.addEventListener("click",()=>g7ConvertDocument(b.dataset.g7Convert,b.dataset.target)));
    document.getElementById("g7-new-quotation")?.addEventListener("click",()=>g7NewSalesDocument("QUOTATION"));
    document.getElementById("g7-new-dn")?.addEventListener("click",()=>g7NewSalesDocument("DELIVERY_NOTE"));
    document.getElementById("g7-new-invoice")?.addEventListener("click",()=>g7NewSalesDocument("INVOICE"));
  }catch(error){renderError("Sales Administration",error);}
}

window.GroceryEnhancementSalesAdmin={render:g7SalesAdministration,approvals:g7ApprovalQueue,newDocument:g7NewSalesDocument};
