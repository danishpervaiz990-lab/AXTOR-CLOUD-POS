(function(){
  "use strict";
  const API_DEFAULT="https://axtor-cloud-pos-production.up.railway.app";
  const base=String(localStorage.getItem("axtorApiBaseUrl")||API_DEFAULT).replace(/\/+$/,"");
  const unwrap=value=>value&&Object.prototype.hasOwnProperty.call(value,"data")?value.data:value;
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  async function get(path){const response=await fetch(base+path,{headers:{Accept:"application/json"},cache:"no-store"});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.message||"Catalogue is unavailable");return unwrap(body)}
  function badge(pack){const preview=!pack.canRegister;return `<span class="status-chip ${preview?"preview":""}">${preview?"Preview roadmap":"Onboarding open"}</span>`}
  function card(pack){return `<article class="industry-card"><div class="d-flex justify-content-between gap-2"><span class="industry-icon"><i class="bi ${esc(pack.icon)}"></i></span>${badge(pack)}</div><h2>${esc(pack.name)}</h2><p>${esc(pack.description)}</p><div class="card-actions"><a class="btn-axtor btn-outline-axtor" href="industry-solution.html?industry=${encodeURIComponent(pack.code)}">View features</a>${pack.canRegister?`<a class="btn-axtor" href="register.html?industry=${encodeURIComponent(pack.code)}">Start trial</a>`:""}</div></article>`}
  async function catalogue(){
    const root=document.querySelector("#industryCatalogue");
    try{const data=await get("/api/v1/public/catalog");root.innerHTML=data.industries.map(card).join("");document.querySelector("#catalogueVersion").textContent=data.registryVersion}
    catch(error){root.innerHTML=`<div class="notice danger">${esc(error.message)}</div>`}
  }
  async function detail(){
    const code=new URLSearchParams(location.search).get("industry")||"retail";
    const root=document.querySelector("#industryDetail");
    try{
      const pack=await get("/api/v1/public/industries/"+encodeURIComponent(code));
      document.title=pack.name+" · Axtor POS Cloud";
      root.innerHTML=`<div class="detail-layout"><section class="detail-card"><div class="d-flex justify-content-between align-items-start gap-3"><span class="industry-icon"><i class="bi ${esc(pack.icon)}"></i></span>${badge(pack)}</div><p class="eyebrow mt-4">Dedicated industry solution</p><h1 class="section-title">${esc(pack.name)}</h1><p class="section-copy fs-5">${esc(pack.description)}</p><h2 class="h5 fw-bold mt-4">Designed for</h2><p>${(pack.suitableFor||[]).map(esc).join(" · ")||"Industry operators"}</p><h2 class="h5 fw-bold mt-4">Pack highlights</h2><ul class="feature-list">${(pack.highlights||[]).map(item=>`<li><i class="bi bi-check-circle-fill"></i>${esc(item)}</li>`).join("")}</ul><h2 class="h5 fw-bold mt-4">Modules</h2><div class="d-flex flex-wrap gap-2">${(pack.modules||[]).map(item=>`<span class="badge text-bg-light border">${esc(item.replaceAll("_"," "))}</span>`).join("")}</div></section><aside class="summary-card"><h2 class="h5 fw-bold">Availability</h2><p>${esc(pack.availabilityMessage)}</p>${pack.canRegister?`<a class="btn-axtor w-100" href="register.html?industry=${encodeURIComponent(pack.code)}">Register for ${esc(pack.name)}</a>`:`<div class="notice warning">This pack is visible for product planning, but registration is disabled until its dedicated workflow and tests are complete.</div>`}<a class="btn-axtor btn-outline-axtor w-100 mt-2" href="industries.html">Compare all industries</a><hr><small class="text-muted">Registry ${esc(pack.registryVersion)}</small></aside></div>`
    }catch(error){root.innerHTML=`<div class="notice danger">${esc(error.message)}</div>`}
  }
  const page=document.body.dataset.publicPage;if(page==="catalogue")catalogue();if(page==="detail")detail();
})();
