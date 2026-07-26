(function(){
  "use strict";
  const U=window.AxtorPage;
  const routeMap={dashboard:"index.html",terminal:"terminal.html",sales:"sales.html",customers:"customer.html",products:"products.html",inventory:"inventory.html",purchases:"purchase.html",reports:"reports.html",expenses:"expenses.html",accounts:"accounts.html",billing:"sales.html",fees:"sales.html",medicines:"products.html",batches:"industry.html",expiry:"industry.html",prescriptions:"industry.html",members:"industry.html",memberships:"industry.html",trainers:"industry.html",programs:"industry.html",facilities:"industry.html",classes:"industry.html",checkins:"industry.html",patients:"industry.html",practitioners:"industry.html",appointments:"industry.html",queue:"industry.html",encounters:"industry.html",academics:"industry.html",attendance:"industry.html",timetable:"industry.html",students:"industry.html",guardians:"industry.html",admissions:"industry.html"};
  function moduleLink(name){const href=routeMap[name]||"industry.html";return `<a class="module-link" href="${href}"><i class="bi bi-arrow-up-right-circle text-success"></i><span>${U.esc(String(name).replaceAll("_"," "))}</span></a>`}
  U.run(async function(){
    try{
      const values=await Promise.all([U.api().apiGet("/api/v1/industry/registry"),U.api().apiGet("/api/v1/industry/summary")]);
      const registry=U.data(values[0]),summary=U.data(values[1]),pack=registry.selected;
      if(!pack){location.replace("setup.html");return}
      document.title=pack.name+" Dashboard · Axtor POS Cloud";
      U.q("#industryDashboardName").textContent=pack.name+" Dashboard";
      U.q("#industryDashboardTopTitle").textContent=pack.name+" Dashboard";
      U.q("#industryDashboardDescription").textContent=pack.description;
      U.q("#industryDashboardModules").innerHTML=pack.modules.map(moduleLink).join("");
      U.q("#industryDashboardStats").innerHTML=[
        ["Workflow records",summary.total||0],["Due in 30 days",summary.dueSoon||0],["Overdue action",summary.overdue||0],["Enabled modules",pack.modules.length]
      ].map(item=>`<div class="summary-card"><small>${U.esc(item[0])}</small><strong>${U.esc(item[1])}</strong></div>`).join("");
      U.q("#industryDashboardWidgets").innerHTML=(pack.dashboardWidgets||[]).length?(pack.dashboardWidgets||[]).map(item=>`<span class="badge text-bg-light border p-2">${U.esc(String(item).replaceAll("_"," "))}</span>`).join(""):'<span class="text-muted">Core POS performance widgets use the shared dashboard.</span>';
    }catch(error){U.q("#industryDashboardError").textContent=error.message||"Dashboard unavailable";U.q("#industryDashboardError").hidden=false}
  });
})();
