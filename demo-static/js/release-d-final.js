(function(){"use strict";
const show=(el,v)=>{el.textContent=typeof v==='string'?v:JSON.stringify(v,null,2)};
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('form[data-api]').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const o=f.querySelector('.result');show(o,'Saving…');let p=f.dataset.api;const body=Object.fromEntries(new FormData(f).entries());if(f.dataset.idField){p=p.replace('{id}',encodeURIComponent(body[f.dataset.idField]||''));delete body[f.dataset.idField]}try{const fn=f.dataset.method==='PATCH'?AxtorAPI.apiPatch:f.dataset.method==='PUT'?AxtorAPI.apiPut:AxtorAPI.apiPost;const r=await fn(p,body);show(o,r.data||r);f.reset()}catch(err){show(o,'Error: '+err.message)}}));
 document.querySelectorAll('[data-get]').forEach(b=>b.addEventListener('click',async()=>{const o=document.querySelector(b.dataset.target||'#report');show(o,'Loading…');try{const r=await AxtorAPI.apiGet(b.dataset.get);show(o,r.data||r)}catch(err){show(o,'Error: '+err.message)}}));
});})();
