(function(){
  'use strict';
  function cleanup(){
    document.querySelectorAll('.axtor-plan-block,[data-plan-gate],[data-subscription-gate]').forEach(function(node){node.remove();});
    document.querySelectorAll('body *').forEach(function(node){
      if(node.children.length)return;
      var lower=String(node.textContent||'').trim().toLowerCase().replace(/\s+/g,' ');
      if((lower.indexOf('trial:')===0&&lower.indexOf('day(s) remaining')>0)||lower==='plans & subscription')node.hidden=true;
    });
  }
  function start(){cleanup();new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
