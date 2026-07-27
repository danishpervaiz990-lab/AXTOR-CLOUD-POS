(function () {
  "use strict";
  const PAGE = document.body.dataset.page || "dashboard";
  const ROOT = "/api/v1/furniture";
  const NAV = [
    ["furniture-dashboard.html", "Dashboard"],
    ["furniture-orders.html", "Custom Orders"],
    ["furniture-measurements.html", "Measurements"],
    ["furniture-production.html", "Production"],
    ["furniture-approvals.html", "Design Approvals"],
    ["furniture-payments.html", "Payments"],
    ["furniture-deliveries.html", "Deliveries"],
    ["furniture-installations.html", "Installations"],
    ["furniture-procurement.html", "Procurement"],
    ["furniture-returns.html", "Returns"],
    ["furniture-warranty.html", "Warranty"],
    ["furniture-reports.html", "Reports"],
    ["furniture-settings.html", "Settings"]
  ];

  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]; }); }
  function unwrap(value) { return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value; }
  async function request(method, path, body, idempotent) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + AxtorAPI.getToken() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "furniture:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(AxtorAPI.getApiBaseUrl() + ROOT + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const payload = await response.json().catch(function () { return null; });
    if (response.status === 401) { AxtorAPI.goToLogin("session-expired", { clearToken: true }); throw new Error("Session expired."); }
    if (!response.ok) throw new Error(payload?.error?.message || "Furniture request failed");
    return unwrap(payload);
  }
  function shell(title, subtitle) {
    const current = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) { return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>"; }).join("");
    document.body.innerHTML = '<div class="f-shell"><aside class="f-nav"><div class="f-brand">AXTOR · FURNITURE</div>' + links + '</aside><main class="f-main"><section class="f-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }
  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (code !== "furniture") throw new Error("This application is available only to Furniture tenants.");
  }
  function fieldsHtml(fields) {
    return fields.map(function (field) {
      const required = field.required ? " required" : "";
      if (field.type === "select") return '<div><label>' + esc(field.label) + '</label><select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + "</option>"; }).join("") + "</select></div>";
      if (field.type === "textarea") return '<div><label>' + esc(field.label) + '</label><textarea name="' + field.name + '"' + required + '></textarea></div>';
      return '<div><label>' + esc(field.label) + '</label><input name="' + field.name + '" type="' + field.type + '"' + required + "></div>';
    }).join("");
  }
  function formPanel(id, title, fields, button) { return '<section class="f-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="f-form">' + fieldsHtml(fields) + '<div class="f-actions"><button class="f-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="f-status"></div></section>'; }
  function tablePanel(id, title, columns) { return '<section class="f-panel"><div class="f-toolbar"><h2>' + esc(title) + '</h2><input class="f-search" data-search="' + id + '" placeholder="Search records"></div><div class="f-table-wrap"><table class="f-table"><thead><tr>' + columns.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"></tbody></table></div></section>'; }
  function nested(row, path) { return path.split(".").reduce(function (x, k) { return x == null ? x : x[k]; }, row); }
  function shown(value) { if (value === null || value === undefined || value === "") return "—"; const text = String(value); return /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text).toLocaleString() : text; }
  function renderRows(id, rows, columns) {
    const query = String(document.querySelector('[data-search="' + id + '"]')?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) { return JSON.stringify(row).toLowerCase().includes(query); }) : rows;
    document.getElementById(id).innerHTML = filtered.map(function (row) { return "<tr>" + columns.map(function (c) { return "<td>" + esc(shown(nested(row, c[0]))) + "</td>"; }).join("") + "</tr>"; }).join("") || '<tr><td colspan="' + columns.length + '">No records found.</td></tr>';
  }
  function payload(form) {
    const result = Object.fromEntries(new FormData(form).entries());
    const numeric = new Set(["quotedAmount","depositRequired","measurementValue","amount","daysBefore"]);
    Object.keys(result).forEach(function (key) { if (result[key] === "true") result[key] = true; else if (result[key] === "false") result[key] = false; else if (numeric.has(key) && result[key] !== "") result[key] = Number(result[key]); });
    return result;
  }
  function bind(id, method, pathBuilder, transform, reload, idempotent) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault(); const status = document.getElementById(id + "Status"); status.textContent = "Saving…"; status.className = "f-status";
      try { let body = payload(event.currentTarget); if (transform) body = transform(body); const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder; await request(method, path, body, idempotent); status.textContent = "Saved successfully."; status.className = "f-status ok"; event.currentTarget.reset(); if (reload) await reload(); }
      catch (error) { status.textContent = error.message || "Save failed"; status.className = "f-status error"; }
    });
  }
  async function dashboard() {
    shell("Furniture Studio Dashboard", "Custom orders, production, delivery and receivables"); const m = await request("GET", "/dashboard");
    document.getElementById("app").innerHTML = '<div class="f-kpis"><div class="f-kpi"><span>Open Orders</span><strong>' + esc(m.openOrders || 0) + '</strong></div><div class="f-kpi"><span>In Production</span><strong>' + esc(m.inProduction || 0) + '</strong></div><div class="f-kpi"><span>Scheduled Deliveries</span><strong>' + esc(m.scheduledDeliveries || 0) + '</strong></div><div class="f-kpi"><span>Outstanding Balance</span><strong>' + esc(m.outstandingBalance || 0) + '</strong></div></div><section class="f-panel"><h2>Order Lifecycle</h2><div class="f-flow"><div class="f-step">Design</div><div class="f-step">Cutting</div><div class="f-step">Assembly</div><div class="f-step">Finishing</div><div class="f-step">Delivery</div></div></section>';
  }
  async function orders() {
    shell("Custom Orders", "Quoted jobs with deposits, balances and due dates"); const columns = [["orderNo","Order"],["customerId","Customer"],["description","Description"],["quotedAmount","Quoted"],["balance","Balance"],["expectedAt","Expected"],["status","Status"]];
    document.getElementById("app").innerHTML = formPanel("orderForm","Create Custom Order",[{name:"customerId",label:"Customer ID",type:"text",required:true},{name:"productId",label:"Product ID",type:"text"},{name:"description",label:"Description",type:"textarea",required:true},{name:"quotedAmount",label:"Quoted amount",type:"number"},{name:"depositRequired",label:"Deposit required",type:"number"},{name:"expectedAt",label:"Expected date",type:"date"}]) + tablePanel("orderRows","Orders",columns);
    let rows=[]; const load=async function(){rows=await request("GET","/orders");renderRows("orderRows",rows,columns);}; bind("orderForm","POST","/orders",null,load,true); await load();
  }
  const ACTIONS = {
    measurements:{title:"Measurements",subtitle:"Order-specific dimensional records",form:"measurementForm",action:"Save Measurement",fields:[{name:"orderId",label:"Order ID",type:"text",required:true},{name:"measurementKey",label:"Measurement",type:"text",required:true},{name:"measurementValue",label:"Value",type:"number",required:true},{name:"unit",label:"Unit",type:"text"},{name:"notes",label:"Notes",type:"textarea"}],method:"POST",path:function(b){const id=b.orderId;delete b.orderId;return "/orders/"+encodeURIComponent(id)+"/measurements";}},
    production:{title:"Production Stages",subtitle:"Assign and progress manufacturing stages",form:"stageForm",action:"Update Stage",fields:[{name:"stageId",label:"Stage ID",type:"text",required:true},{name:"status",label:"Status",type:"select",required:true,options:["pending","in_progress","completed","blocked"]},{name:"assignedTo",label:"Assigned to",type:"text"},{name:"notes",label:"Notes",type:"textarea"}],method:"PATCH",path:function(b){const id=b.stageId;delete b.stageId;return "/production-stages/"+encodeURIComponent(id);}},
    approvals:{title:"Design Approvals",subtitle:"Revision-based customer and design approvals",form:"approvalForm",action:"Record Approval",fields:[{name:"orderId",label:"Order ID",type:"text",required:true},{name:"status",label:"Status",type:"select",required:true,options:["approved","rejected","changes_requested"]},{name:"approvedBy",label:"Approved by",type:"text"},{name:"notes",label:"Notes",type:"textarea"}],method:"POST",path:function(b){const id=b.orderId;delete b.orderId;return "/orders/"+encodeURIComponent(id)+"/approvals";}},
    payments:{title:"Order Payments",subtitle:"Deposit and installment allocation",form:"paymentForm",action:"Post Payment",fields:[{name:"orderId",label:"Order ID",type:"text",required:true},{name:"amount",label:"Amount",type:"number",required:true},{name:"paymentType",label:"Payment type",type:"select",options:["deposit","installment","final"]},{name:"method",label:"Method",type:"select",options:["cash","card","bank_transfer","cheque"]},{name:"reference",label:"Reference",type:"text"}],method:"POST",idempotent:true,path:function(b){const id=b.orderId;delete b.orderId;return "/orders/"+encodeURIComponent(id)+"/payments";}},
    deliveries:{title:"Furniture Deliveries",subtitle:"Schedule transport for completed orders",form:"deliveryForm",action:"Schedule Delivery",fields:[{name:"customOrderId",label:"Order ID",type:"text",required:true},{name:"scheduledAt",label:"Scheduled at",type:"datetime-local",required:true},{name:"vehicleReference",label:"Vehicle",type:"text"},{name:"driverName",label:"Driver",type:"text"}],method:"POST",path:"/deliveries"},
    procurement:{title:"Order Procurement",subtitle:"Order-linked material and supplier requirements",form:"procurementForm",action:"Create Procurement",fields:[{name:"customOrderId",label:"Order ID",type:"text",required:true},{name:"supplierId",label:"Supplier ID",type:"text"},{name:"description",label:"Description",type:"textarea",required:true},{name:"amount",label:"Amount",type:"number"},{name:"status",label:"Status",type:"select",options:["requested","ordered","received"]}],method:"POST",path:"/procurements"},
    settings:{title:"Furniture Settings",subtitle:"Order, delivery and warranty notification rules",form:"ruleForm",action:"Save Rule",fields:[{name:"eventKey",label:"Event key",type:"text",required:true},{name:"channel",label:"Channel",type:"select",options:["in_app","email","sms","whatsapp"]},{name:"daysBefore",label:"Days before",type:"number"},{name:"active",label:"Active",type:"select",options:["true","false"]}],method:"PUT",path:"/notification-rules/furniture"}
  };
  async function actionPage(config) { shell(config.title,config.subtitle); document.getElementById("app").innerHTML=formPanel(config.form,config.action,config.fields,config.action)+'<section class="f-panel"><div class="f-note">All operations are tenant-scoped and protected by server-side permissions.</div></section>'; bind(config.form,config.method,config.path,null,null,Boolean(config.idempotent)); }
  async function installations() {
    shell("Installations","Schedule, complete and capture customer sign-off"); document.getElementById("app").innerHTML=formPanel("createForm","Schedule Installation",[{name:"deliveryId",label:"Delivery ID",type:"text",required:true},{name:"scheduledAt",label:"Scheduled at",type:"datetime-local",required:true},{name:"technicianName",label:"Technician",type:"text"},{name:"notes",label:"Notes",type:"textarea"}])+formPanel("completeForm","Complete Installation",[{name:"installationId",label:"Installation ID",type:"text",required:true},{name:"notes",label:"Completion notes",type:"textarea"}])+formPanel("signoffForm","Customer Sign-off",[{name:"installationId",label:"Installation ID",type:"text",required:true},{name:"customerName",label:"Customer name",type:"text",required:true},{name:"signatureReference",label:"Signature reference",type:"text"},{name:"notes",label:"Notes",type:"textarea"}]); bind("createForm","POST","/installations"); bind("completeForm","PATCH",function(b){const id=b.installationId;delete b.installationId;return "/installations/"+encodeURIComponent(id)+"/complete";}); bind("signoffForm","POST",function(b){const id=b.installationId;delete b.installationId;return "/installations/"+encodeURIComponent(id)+"/signoff";});
  }
  async function returnsPage() {
    shell("Returns & Resolution","Record custom-order returns and controlled resolutions"); document.getElementById("app").innerHTML=formPanel("createForm","Create Return",[{name:"customOrderId",label:"Order ID",type:"text",required:true},{name:"reason",label:"Reason",type:"textarea",required:true}])+formPanel("resolveForm","Resolve Return",[{name:"returnId",label:"Return ID",type:"text",required:true},{name:"resolution",label:"Resolution",type:"textarea",required:true}]); bind("createForm","POST","/returns"); bind("resolveForm","PATCH",function(b){const id=b.returnId;delete b.returnId;return "/returns/"+encodeURIComponent(id)+"/resolve";});
  }
  async function warranty() {
    shell("Warranty Claims","Register and resolve customer warranty claims"); document.getElementById("app").innerHTML=formPanel("claimForm","Create Claim",[{name:"warrantyId",label:"Warranty ID",type:"text",required:true},{name:"issue",label:"Issue",type:"textarea",required:true}])+formPanel("resolveForm","Resolve Claim",[{name:"claimId",label:"Claim ID",type:"text",required:true},{name:"resolution",label:"Resolution",type:"textarea",required:true}]); bind("claimForm","POST","/warranty-claims"); bind("resolveForm","PATCH",function(b){const id=b.claimId;delete b.claimId;return "/warranty-claims/"+encodeURIComponent(id)+"/resolve";});
  }
  async function reports() { shell("Furniture Reports","Orders, production, claims and payment summaries"); document.getElementById("app").innerHTML='<section class="f-panel"><button id="run" class="f-btn">Refresh Report</button><pre id="out"></pre></section>'; const load=async function(){document.getElementById("out").textContent=JSON.stringify(await request("GET","/reports"),null,2);};document.getElementById("run").onclick=load;await load(); }
  document.addEventListener("DOMContentLoaded",async function(){try{await verifyTenant();if(PAGE==="dashboard")return dashboard();if(PAGE==="orders")return orders();if(PAGE==="installations")return installations();if(PAGE==="returns")return returnsPage();if(PAGE==="warranty")return warranty();if(PAGE==="reports")return reports();if(ACTIONS[PAGE])return actionPage(ACTIONS[PAGE]);throw new Error("Unsupported Furniture page.");}catch(error){if(!document.getElementById("app"))shell("Furniture Application","Unable to open requested module");document.getElementById("app").innerHTML='<section class="f-panel"><div class="f-status error">'+esc(error.message||"Furniture application failed")+"</div></section>";}});
})();
