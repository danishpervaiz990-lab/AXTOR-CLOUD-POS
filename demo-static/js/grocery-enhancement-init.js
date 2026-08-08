"use strict";

const g7RenderBase=render;
render=async function(){
  if(!token())return g7RenderBase();
  if(!state.me){try{await loadSession();}catch(_){return g7RenderBase();}}
  const view=state.view||viewFromUrl();state.view=view;
  if(view==="settings-63")return GroceryEnhancementCore.settings();
  if(view==="numbering-64")return GroceryEnhancementCore.numbering();
  if(view==="product-new-63")return GroceryEnhancementProduct.render();
  if(view==="sales-admin-63"){
    if(state.query?.tab==="approvals"||state.query?.action==="approvals")return GroceryEnhancementSalesAdmin.approvals();
    return GroceryEnhancementSalesAdmin.render();
  }
  return g7RenderBase();
};

// Defer one refresh until all later safety wrappers (especially the existing
// render-race guard) have had a chance to wrap this new render function.
setTimeout(()=>{try{render();}catch(e){console.error("Grocery enhancement activation failed",e);}},0);
