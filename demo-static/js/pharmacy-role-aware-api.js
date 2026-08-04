(function(){
"use strict";
const api=window.AxtorAPI;
if(!api||typeof api.apiGet!=="function")return;
function roles(){
  try{
    const user=JSON.parse(localStorage.getItem("currentUser")||localStorage.getItem("axtorCurrentUser")||"{}");
    return (Array.isArray(user.roles)?user.roles:[user.role]).filter(Boolean).map(role=>String(role).trim().toLowerCase());
  }catch{return[];}
}
const page=String(document.body?.dataset?.pharmacyPage||"").toLowerCase();
const roleSet=new Set(roles());
const pharmacist=roleSet.has("pharmacist");
if(page!=="billing"||!pharmacist)return;
const originalGet=api.apiGet.bind(api);
api.apiGet=function(path,options){
  const route=String(path||"");
  if(/^\/api\/v1\/customers(?:\?|$)/.test(route)){
    return Promise.resolve({ok:true,data:[]});
  }
  return originalGet(path,options);
};
})();
