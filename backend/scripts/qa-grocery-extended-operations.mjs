import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('grocery-live-runtime.json', 'utf8'));
const backend = runtime.backendOrigin || 'https://axtor-cloud-pos-production.up.railway.app';
const token = runtime.token;
const results = [];
const counts = { purchases: 0, returns: 0, refunds: 0 };

function unwrap(body) { return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body; }
async function request(path, { method='GET', body, key, expected=[200,201] }={}) {
  const headers = { Accept:'application/json', Authorization:`Bearer ${token}` };
  if (body !== undefined) headers['Content-Type']='application/json';
  if (key) headers['Idempotency-Key']=key;
  const response = await fetch(`${backend}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const text = await response.text(); let json=null; try{json=text?JSON.parse(text):null;}catch{}
  if(!expected.includes(response.status)){ const e=new Error(json?.error?.message||`${method} ${path} returned ${response.status}`); e.status=response.status; e.body=json||text.slice(0,1000); throw e; }
  return json;
}
function ok(name, details={}) { results.push({name,status:'PASS',...details}); }
function bad(name,error,details={}) { results.push({name,status:'FAIL',error:String(error?.message||error),...details}); }

try {
  const productsBody = await request('/api/v1/products');
  const products = productsBody.products || unwrap(productsBody)?.products || unwrap(productsBody) || [];
  const suppliersBody = await request('/api/v1/suppliers');
  const suppliers = unwrap(suppliersBody) || [];
  const context = unwrap(await request('/api/v1/sales-documents/context'));
  const branchId = context?.branches?.[0]?.id || null;
  const warehouseId = context?.warehouses?.[0]?.id || null;
  if(products.length < 50 || suppliers.length < 5 || !warehouseId) throw new Error('Core tenant data is incomplete for extended operations');

  for(let i=0;i<10;i++){
    const lines=[];
    for(let j=0;j<10;j++){
      const p=products[(i*5+j)%products.length];
      lines.push({productId:p.id,sku:p.sku,barcode:p.barcode,name:p.name,qty:10+(j%3),cost:Number(p.costPrice||1),discount:j===0?1:0,taxRate:0});
    }
    const purchase=unwrap(await request('/api/v1/purchases',{method:'POST',key:`grocery-ext-purchase-${runtime.businessId}-${i+1}`,body:{supplierId:suppliers[i%suppliers.length].id,branchId,warehouseId,status:'POSTED',paid:i<5?100:0,purchaseDate:new Date().toISOString(),dueDate:new Date(Date.now()+30*86400000).toISOString(),referenceNo:`QA-PO-${i+1}`,items:lines}}));
    if(!purchase?.id) throw new Error(`Purchase ${i+1} did not persist`);
    counts.purchases++;
  }
  ok('Ten posted purchases with 100 lines',{count:counts.purchases,lines:100});

  const docsBody=unwrap(await request('/api/v1/sales-documents?documentType=invoice&limit=250'));
  const docs=Array.isArray(docsBody)?docsBody:docsBody?.data||[];
  const candidates=docs.filter(d=>Array.isArray(d.items)&&d.items.length&&Number(d.paid||0)>0).slice(0,15);
  if(candidates.length<15) throw new Error(`Only ${candidates.length} paid invoices available for returns`);
  const createdReturns=[];
  for(let i=0;i<15;i++){
    const doc=candidates[i]; const source=doc.items[0];
    const sold=Number(source.qty||source.quantity||1);
    const qty=i<10?Math.min(sold,Math.max(.001,Number((sold/2).toFixed(3)))):sold;
    const ret=unwrap(await request('/api/v1/sales-returns',{method:'POST',key:`grocery-ext-return-${runtime.businessId}-${i+1}`,body:{sourceSalesDocumentId:doc.id,reason:i<10?'QA partial return':'QA full line return',items:[{productId:source.productId,sku:source.sku,name:source.name,soldQty:sold,returnQty:qty,rate:Number(source.rate||source.unitPrice||0)}]}}));
    if(!ret?.id) throw new Error(`Return ${i+1} did not persist`);
    createdReturns.push({return:ret,doc}); counts.returns++;
  }
  ok('Fifteen posted returns',{partial:10,fullLine:5,total:counts.returns});

  for(let i=0;i<5;i++){
    const pair=createdReturns[i];
    const refundable=Math.min(Number(pair.return.total||pair.return.totalAmount||0),Number(pair.doc.paid||0));
    if(!(refundable>0)) throw new Error(`Return ${i+1} has no refundable amount`);
    const refund=unwrap(await request('/api/v1/refunds',{method:'POST',key:`grocery-ext-refund-${runtime.businessId}-${i+1}`,body:{salesDocumentId:pair.doc.id,salesReturnId:pair.return.id,amount:refundable,refundMethod:i%2===0?'cash':'card',referenceNo:`QA-RFD-${i+1}`,notes:'Grocery certification refund'}}));
    if(!refund?.id) throw new Error(`Refund ${i+1} did not persist`);
    counts.refunds++;
  }
  ok('Five refunds posted',{count:counts.refunds});

  const purchases=unwrap(await request('/api/v1/purchases?limit=50'));
  const returns=unwrap(await request('/api/v1/sales-returns'));
  const refunds=unwrap(await request('/api/v1/refunds'));
  const purchaseRows=Array.isArray(purchases)?purchases:purchases?.data||[];
  const returnRows=Array.isArray(returns)?returns:returns?.data||[];
  const refundRows=Array.isArray(refunds)?refunds:refunds?.data||[];
  if(purchaseRows.length<10||returnRows.length<15||refundRows.length<5) throw new Error('Extended-operation persistence reconciliation failed');
  ok('Extended operation persistence reconciliation',{purchases:purchaseRows.length,returns:returnRows.length,refunds:refundRows.length});

  const reportEndpoints=['/api/v1/dashboard','/api/v1/reports/daily-sales','/api/v1/reports/sales-by-product','/api/v1/reports/profit-and-loss','/api/v1/inventory/stock','/api/v1/industry/batches','/api/v1/industry/grocery/expiry-risk','/api/v1/industry/grocery/waste','/api/v1/industry/grocery/recalls'];
  for(const endpoint of reportEndpoints){
    try{await request(endpoint);ok(`Read ${endpoint}`);}catch(error){bad(`Read ${endpoint}`,error,{status:error.status});}
  }
} catch(error){ bad('Extended Grocery operations',error,{status:error.status,response:error.body}); }

const report={generatedAt:new Date().toISOString(),tenant:{businessId:runtime.businessId,businessSlug:runtime.businessSlug},counts,results,overall:results.length>0&&results.every(r=>r.status==='PASS')?'PASS':'FAIL'};
await fs.writeFile('grocery-extended-operations-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.overall!=='PASS')process.exitCode=1;
