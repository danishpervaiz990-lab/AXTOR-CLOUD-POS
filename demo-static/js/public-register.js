(function(){
  "use strict";
  const API_DEFAULT="https://axtor-cloud-pos-production.up.railway.app";
  const base=String(localStorage.getItem("axtorApiBaseUrl")||API_DEFAULT).replace(/\/+$/,"");
  const form=document.querySelector("#registrationForm"),message=document.querySelector("#registrationMessage"),submit=document.querySelector("#registrationSubmit");
  let catalog=null;
  const unwrap=value=>value&&Object.prototype.hasOwnProperty.call(value,"data")?value.data:value;
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  function show(text,type="danger"){message.className="notice "+type;message.textContent=text;message.hidden=false}
  function options(select,rows,label="name"){select.innerHTML=rows.map(row=>`<option value="${esc(row.code)}">${esc(row[label])}${row.canRegister===false?" — preview only":""}</option>`).join("")}
  function idempotencyKey(){const saved=sessionStorage.getItem("axtorRegistrationKey");if(saved)return saved;const key="reg:"+crypto.randomUUID();sessionStorage.setItem("axtorRegistrationKey",key);return key}
  async function load(){
    try{
      const response=await fetch(base+"/api/v1/public/catalog",{headers:{Accept:"application/json"},cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Registration catalogue unavailable");catalog=unwrap(body);
      const industries=catalog.industries.filter(item=>item.canRegister);options(form.industryCode,industries);options(form.planCode,catalog.plans);options(form.baseCurrency,catalog.currencies);options(form.language,catalog.languages);
      const requested=new URLSearchParams(location.search).get("industry");if(requested&&industries.some(item=>item.code===requested))form.industryCode.value=requested;else if(requested)show("That industry is currently preview-only. Choose one of the packs available for controlled onboarding.","warning");
    }catch(error){show(error.message);submit.disabled=true}
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();message.hidden=true;if(!form.checkValidity()){form.reportValidity();return}
    const data=Object.fromEntries(new FormData(form).entries());
    data.acceptTerms=form.acceptTerms.checked;data.acceptPrivacy=form.acceptPrivacy.checked;data.pricesIncludeTax=form.pricesIncludeTax.checked;data.sampleDataRequested=form.sampleDataRequested.checked;
    submit.disabled=true;submit.textContent="Provisioning secure workspace…";
    try{
      const response=await fetch(base+"/api/v1/public/register",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","Idempotency-Key":idempotencyKey()},body:JSON.stringify(data)}),body=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(body?.error?.message||"Registration could not be completed");
      const result=unwrap(body);sessionStorage.removeItem("axtorRegistrationKey");
      show(`Workspace ${result.business.slug} is ready. Redirecting to secure login…`,"");
      setTimeout(()=>location.href=`login.html?workspace=${encodeURIComponent(result.business.slug)}&email=${encodeURIComponent(result.owner.email)}&return=industry-dashboard.html`,1200);
    }catch(error){show(error.message);submit.disabled=false;submit.textContent="Create secure workspace"}
  });
  load();
})();
