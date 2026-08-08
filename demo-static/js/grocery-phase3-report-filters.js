"use strict";
// Point 22 literal filter completion: all dimensions remain combinable when meaningful to the selected report.
reportFilterForm=function(catalog,opts,vans,counters,family){
 const reports=(catalog.reports||[]).filter(x=>family==="all"||x.family===family),selected=state.report30.reportId&&reports.some(x=>x.id===state.report30.reportId)?state.report30.reportId:(reports[0]?.id||"");state.report30.reportId=selected;
 const products=opts.products||[],categories=[...new Set(products.map(x=>x.category).filter(Boolean))].sort(),brands=[...new Set(products.map(x=>x.brand).filter(Boolean))].sort(),cashiers=(state.report30.cashiers||[]);
 const simple=(name,list)=>`<select name="${name}"><option value="">All</option>${list.map(x=>`<option value="${esc(x)}">${esc(String(x).replaceAll('_',' '))}</option>`).join('')}</select>`;
 return `<form id="report30-filter" class="form-grid"><div class="form-two">
 <div class="field"><label>Report</label><select name="reportId" required>${reports.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.title)}</option>`).join('')}</select></div>
 <div class="field"><label>Date preset</label>${simple("period",["today","yesterday","this-week","last-week","this-month","last-month","this-quarter","this-year","custom"])}</div>
 <div class="field"><label>From</label><input type="date" name="from"></div><div class="field"><label>To</label><input type="date" name="to"></div>
 <div class="field"><label>Branch</label><select name="branchId">${reportOption(opts.branches)}</select></div><div class="field"><label>Warehouse</label><select name="warehouseId">${reportOption(opts.warehouses)}</select></div>
 <div class="field"><label>Counter</label><select name="counterId">${reportOption(counters)}</select></div><div class="field"><label>Van</label><select name="vanId">${reportOption(vans,"",x=>x.displayName||x.referenceNo)}</select></div>
 <div class="field"><label>Cashier</label><select name="cashierId">${reportOption(cashiers,"",x=>`${x.name}${x.email?` · ${x.email}`:''}`)}</select></div><div class="field"><label>User</label><select name="userId">${reportOption(cashiers,"",x=>`${x.name}${x.email?` · ${x.email}`:''}`)}</select></div>
 <div class="field"><label>Salesman</label><select name="salesmanId">${reportOption(opts.salesmen)}</select></div><div class="field"><label>Customer</label><select name="customerId">${reportOption(opts.customers)}</select></div>
 <div class="field"><label>Supplier</label><select name="supplierId">${reportOption(opts.suppliers)}</select></div><div class="field"><label>Product</label><select name="productId">${reportOption(products,"",x=>`${x.name}${x.sku?` · ${x.sku}`:''}`)}</select></div>
 <div class="field"><label>Category</label>${simple("category",categories)}</div><div class="field"><label>Brand</label>${simple("brand",brands)}</div>
 <div class="field"><label>Payment Method</label>${simple("paymentMethod",["cash","credit_card","debit_card","card","bank_transfer","cheque","mobile_wallet","credit","mixed"])}</div>
 <div class="field"><label>Payment Status</label>${simple("paymentStatus",["paid","partially_paid","unpaid","issued","posted"])}</div>
 <div class="field"><label>Due Status</label>${simple("dueStatus",["paid","not_due","overdue"])}</div><div class="field"><label>Tax</label>${simple("tax",["taxable","zero/no tax"])}</div>
 <div class="field"><label>Group By</label>${simple("groupBy",["product","category","brand","customer","salesperson","cashier","counter","branch","warehouse","van","payment_method","supplier","status","hour","day","week","month","tax"])}</div>
 <div class="field"><label>Search</label><input name="search" placeholder="Search report rows"></div><div class="field"><label>Sort column</label><input name="sortBy" placeholder="e.g. netSales, amount, quantity"></div>
 <div class="field"><label>Sort direction</label>${simple("sortDir",["desc","asc"])}</div><div class="field"><label>Page size</label>${simple("pageSize",["25","50","100","250","500"])}</div>
 <label class="check"><input type="checkbox" name="comparison" value="1">Comparison period</label></div><button class="button button-primary">Run Report</button></form>`;
};
const reports30Base=reports30;
reports30=async function(family="all"){
 try{state.report30.cashiers=unwrap(await get("/api/v1/grocery/cashiers").catch(()=>({data:[]})))||[];}catch{state.report30.cashiers=[];}
 return reports30Base(family);
};
