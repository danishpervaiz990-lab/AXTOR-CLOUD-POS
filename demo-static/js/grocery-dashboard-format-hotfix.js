"use strict";

// metric() escapes subtext by design, so comparison helpers must return text, not HTML.
p50Pct=function(comparison){
  if(!comparison||comparison.valid===false||comparison.changePct==null)return "No valid prior period";
  const change=num(comparison.changePct);
  return `${change>=0?'+':''}${change.toFixed(2)}% · ${money(comparison.previous)} prior`;
};

// Authenticated reloads can render before the later requirement layers finish loading.
// Refresh the dashboard once after the final dashboard formatter is installed.
if(state.view==='dashboard'&&token()&&state.me)render();
