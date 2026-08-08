"use strict";

// Grocery views load tenant data asynchronously. If the user changes modules while an
// older view is still loading, that older render must not be allowed to become the
// final visible screen after its request completes.
const groceryRenderRaceBase=render;
let groceryRenderRecoveryScheduled=false;

render=async function(...args){
  const requestedView=state.view||viewFromUrl();
  try{
    return await groceryRenderRaceBase(...args);
  }finally{
    const currentView=state.view||viewFromUrl();
    if(currentView!==requestedView&&!groceryRenderRecoveryScheduled){
      groceryRenderRecoveryScheduled=true;
      queueMicrotask(()=>{
        groceryRenderRecoveryScheduled=false;
        render();
      });
    }
  }
};
