(function(){
  'use strict';
  const KEY='gym.invoice.settings.cache';
  const PROFILES=['a4','thermal80','thermal58'];
  const defaults={profile:'a4',density:'standard',footer:'',showMemberNumber:true,showPlan:true,showMembershipPeriod:true,showNextDueDate:true,showTrainer:true,showFacility:true,showPaymentSchedule:true};
  const unwrap=v=>v&&Object.prototype.hasOwnProperty.call(v,'data')?v.data:v;
  const api=()=>window.AxtorAPI;
  function normalize(v){const next=Object.assign({},defaults,v||{});if(!PROFILES.includes(next.profile))next.profile=defaults.profile;return next;}
  function cache(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}return v;}
  function cached(){try{return normalize(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return normalize();}}
  async function load(){
    try{
      const res=unwrap(await api().apiGet('/api/v1/settings',{cache:false}));
      const list=Array.isArray(res)?res:(res?.items||res?.records||[]);
      const row=list.find(x=>x.key==='invoice.settings'||x.code==='invoice.settings');
      const value=normalize(row?.value||row?.settings||row?.data);
      cache(value); window.dispatchEvent(new CustomEvent('axtor:gym-print-settings',{detail:value})); return value;
    }catch{return cached();}
  }
  async function save(value){
    const next=normalize(value);
    const res=unwrap(await api().apiPut('/api/v1/settings/invoice.settings',next));
    cache(next); window.dispatchEvent(new CustomEvent('axtor:gym-print-settings',{detail:next})); return res||next;
  }
  function bind(){
    const form=document.querySelector('[data-gym-print-settings]'); if(!form)return;
    load().then(v=>{for(const [k,val] of Object.entries(v)){const el=form.elements.namedItem(k);if(!el)continue;if(el.type==='checkbox')el.checked=Boolean(val);else el.value=val??'';}});
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');const status=form.querySelector('[data-print-status]');if(btn)btn.disabled=true;if(status)status.textContent='Saving…';try{const out={};for(const el of form.elements){if(!el.name)continue;out[el.name]=el.type==='checkbox'?el.checked:el.value;}await save(out);if(status)status.textContent='Invoice & Print settings saved.';}catch(err){if(status)status.textContent=err?.message||'Unable to save print settings.';}finally{if(btn)btn.disabled=false;}});
  }
  window.AxtorGymPrintSettings={profiles:PROFILES,defaults,load,save,cached,normalize};
  document.addEventListener('DOMContentLoaded',bind);
})();