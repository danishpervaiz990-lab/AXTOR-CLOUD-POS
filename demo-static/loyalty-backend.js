(function(){
  const css = getComputedStyle(document.documentElement);
  const brand = css.getPropertyValue('--brand').trim() || '#10b981';
  const accent = css.getPropertyValue('--accent').trim() || '#f59e0b';
  const info = css.getPropertyValue('--info').trim() || '#3b82f6';
  const purple = css.getPropertyValue('--purple').trim() || '#8b5cf6';
  const muted = css.getPropertyValue('--muted').trim() || '#64748b';
  function ctx(id){ const el = document.getElementById(id); return el ? el.getContext('2d') : null; }
  function line(id, labels, data, label){ const c=ctx(id); if(!c) return; new Chart(c,{type:'line',data:{labels,datasets:[{label,data,borderColor:brand,backgroundColor:'rgba(16,185,129,.12)',fill:true,tension:.42,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:muted}},y:{grid:{color:'rgba(148,163,184,.18)'},ticks:{color:muted}}}}}); }
  function doughnut(id, labels, data){ const c=ctx(id); if(!c) return; new Chart(c,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:[brand,info,accent,purple,'#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}}); }
  function bar(id, labels, data, label){ const c=ctx(id); if(!c) return; new Chart(c,{type:'bar',data:{labels,datasets:[{label,data,backgroundColor:brand,borderRadius:10}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:muted}},y:{grid:{color:'rgba(148,163,184,.18)'},ticks:{color:muted}}}}}); }
  document.addEventListener('DOMContentLoaded',()=>{ if(typeof Chart==='undefined') return;
    line('dashboardSalesChart',['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],[4200,5100,4700,6800,7250,8100,9050],'Sales');
    doughnut('dashboardCategoryChart',['Automotive','Industrial','Wood','Thinners','Tools'],[42,24,16,11,7]);
    line('salesTrendChart',['Jan','Feb','Mar','Apr','May','Jun'],[112000,125000,138000,131000,148000,165000],'Sales');
    doughnut('paymentMixChart',['Cash','Card','Credit','Bank'],[40,28,22,10]);
    bar('productsStockChart',['2K Paint','Clear Coat','NC Thinner','Epoxy','PU Wood','Putty'],[128,72,310,44,91,156],'Stock');
    bar('inventoryValuationChart',['Main','Retail','Warehouse B','Van Stock'],[245000,81000,126000,32000],'Value');
    line('purchaseTrendChart',['Jan','Feb','Mar','Apr','May','Jun'],[76000,82000,64000,91000,85000,104000],'Purchase');
    doughnut('accountsCashChart',['Cash','CBQ','QNB','Card Settlement'],[18,42,27,13]);
    bar('expensesChart',['Rent','Salary','Fuel','Utilities','Marketing','Other'],[6500,12000,1800,900,1250,2100],'Expense');
    line('reportsProfitChart',['Jan','Feb','Mar','Apr','May','Jun'],[18000,22500,20100,24600,28900,31500],'Profit');
  });
})();
