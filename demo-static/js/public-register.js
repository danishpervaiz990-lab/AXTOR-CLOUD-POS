(function(){
  "use strict";
  const API_DEFAULT="https://axtor-cloud-pos-production.up.railway.app";
  const base=String(localStorage.getItem("axtorApiBaseUrl")||API_DEFAULT).replace(/\/+$/,""),TOKEN_KEY="axtorAuthToken";
  const form=document.querySelector("#registrationForm"),message=document.querySelector("#registrationMessage"),submit=document.querySelector("#registrationSubmit");
  let catalog=null;
  const unwrap=value=>value&&Object.prototype.hasOwnProperty.call(value,"data")?value.data:value;
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  function show(text,type="danger"){message.className="notice "+type;message.textContent=text;message.hidden=false}
  function options(select,rows,label="name"){select.innerHTML=rows.map(row=>`<option value="${esc(row.code)}">${esc(row[label])}${row.canRegister===false?" — preview only":""}</option>`).join("")}
  function idempotencyKey(){const saved=sessionStorage.getItem("axtorRegistrationKey");if(saved)return saved;const key="reg:"+crypto.randomUUID();sessionStorage.setItem("axtorRegistrationKey",key);return key}
  function clearSession(){[TOKEN_KEY,"axtorTokenType","axtorTokenExpiresIn","axtorBusiness","currentUser","axtorCurrentUser"].forEach(key=>localStorage.removeItem(key))}
  async function load(){
    try{
      const response=await fetch(base+"/api/v1/public/catalog",{headers:{Accept:"application/json"},cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Registration catalogue unavailable");catalog=unwrap(body);
      const industries=catalog.industries.filter(item=>item.canRegister);options(form.industryCode,industries);options(form.planCode,catalog.plans);options(form.baseCurrency,catalog.currencies);options(form.language,catalog.languages);
      const requested=new URLSearchParams(location.search).get("industry");if(requested&&industries.some(item=>item.code===requested))form.industryCode.value=requested;else if(requested)show("That industry is currently preview-only. Choose one of the packs available for controlled onboarding.","warning");
    }catch(error){show(error.message);submit.disabled=true}
  }
  async function establishSession(result,password){
    const credentials={businessSlug:String(result.business.slug||"").trim().toLowerCase(),email:String(result.owner.email||"").trim().toLowerCase(),password};
    const response=await fetch(base+"/api/v1/auth/login",{method:"POST",cache:"no-store",credentials:"omit",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(credentials)});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok||!body?.token)throw new Error(body?.error?.message||"Workspace was created, but its owner session could not be established");
    const appUser={id:body.user?.id||null,name:body.user?.name||"Owner",email:body.user?.email||credentials.email,role:body.user?.role||"Owner",roles:body.user?.roles||["Owner"],businessId:body.business?.id||result.business.id,businessSlug:body.business?.slug||credentials.businessSlug,salesmanId:null,mustChangePassword:Boolean(body.user?.mustChangePassword)};
    clearSession();localStorage.setItem("axtorApiBaseUrl",base);localStorage.setItem(TOKEN_KEY,body.token);localStorage.setItem("axtorTokenType",body.tokenType||"Bearer");localStorage.setItem("axtorTokenExpiresIn",String(body.expiresIn||86400));localStorage.setItem("axtorBusiness",JSON.stringify(body.business||result.business));localStorage.setItem("currentUser",JSON.stringify(appUser));localStorage.setItem("axtorCurrentUser",JSON.stringify(appUser));
    sessionStorage.removeItem("axtorAuthRedirectInProgress");sessionStorage.removeItem("axtorAuthReturnUrl");
    return appUser;
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();message.hidden=true;if(!form.checkValidity()){form.reportValidity();return}
    const data=Object.fromEntries(new FormData(form).entries());
    data.acceptTerms=form.acceptTerms.checked;data.acceptPrivacy=form.acceptPrivacy.checked;data.pricesIncludeTax=form.pricesIncludeTax.checked;data.sampleDataRequested=form.sampleDataRequested.checked;
    const submittedPassword=String(data.password||"");
    submit.disabled=true;submit.textContent="Provisioning secure workspace…";
    try{
      const response=await fetch(base+"/api/v1/public/register",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","Idempotency-Key":idempotencyKey()},body:JSON.stringify(data)}),body=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(body?.error?.message||"Registration could not be completed");
      const result=unwrap(body);submit.textContent="Securing owner session…";
      await establishSession(result,submittedPassword);sessionStorage.removeItem("axtorRegistrationKey");
      show(`Workspace ${result.business.slug} is ready. Opening your ${result.industry?.name||"industry"} dashboard…`,"");
      location.replace("router.html");
    }catch(error){show(error.message);submit.disabled=false;submit.textContent="Create secure workspace"}
  });
  load();
})();