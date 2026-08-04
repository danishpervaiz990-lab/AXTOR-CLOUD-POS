(function(){
"use strict";
if(document.body?.dataset?.pharmacyPage!=="billing")return;
const api=window.AxtorAPI;
if(!api||typeof api.apiGet!=="function")return;
const original=api.apiGet.bind(api);
api.apiGet=function(path,options){
  const requestPath=String(path||"");
  if(/^\/api\/v1\/customers(?:\?|$)/.test(requestPath)){
    return Promise.resolve({ok:true,count:0,customers:[],data:[]});
  }
  return original(path,options);
};
})();
