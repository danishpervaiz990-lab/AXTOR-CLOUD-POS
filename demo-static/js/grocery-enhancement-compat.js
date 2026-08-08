"use strict";

/* Small compatibility bridge kept separate so phase1–6 globals remain untouched. */
function g7Status(message,type="info"){
  try{if(typeof g62Status==="function")return g62Status(message,type);}catch(_){}
  if(message)console.info(`[Grocery ${type}]`,message);
}

const g7StaticLanguageInfo={
  en:{code:"en",locale:"en",dir:"ltr"},"zh-CN":{code:"zh-CN",locale:"zh-CN",dir:"ltr"},hi:{code:"hi",locale:"hi-IN",dir:"ltr"},es:{code:"es",locale:"es",dir:"ltr"},fr:{code:"fr",locale:"fr",dir:"ltr"},ar:{code:"ar",locale:"ar",dir:"rtl"},bn:{code:"bn",locale:"bn-BD",dir:"ltr"},pt:{code:"pt",locale:"pt",dir:"ltr"},ru:{code:"ru",locale:"ru",dir:"ltr"},ur:{code:"ur",locale:"ur-PK",dir:"rtl"},id:{code:"id",locale:"id-ID",dir:"ltr"},de:{code:"de",locale:"de",dir:"ltr"},ja:{code:"ja",locale:"ja-JP",dir:"ltr"},tr:{code:"tr",locale:"tr-TR",dir:"ltr"},ko:{code:"ko",locale:"ko-KR",dir:"ltr"}
};
g7LanguageInfo=function(code){const wanted=String(code||"en").toLowerCase(),fromServer=g7State.catalog?.languages?.find(x=>String(x.code).toLowerCase()===wanted);if(fromServer)return fromServer;return Object.values(g7StaticLanguageInfo).find(x=>x.code.toLowerCase()===wanted)||g7StaticLanguageInfo.en;};
g7ApplyLocale=function(code){const info=g7LanguageInfo(code);g7State.language=info.code||"en";g7State.locale=info.locale||"en";g7State.dir=info.dir||"ltr";document.documentElement.lang=g7State.language;document.documentElement.dir=g7State.dir;try{localStorage.setItem("groceryLanguagePreference",g7State.language);}catch(_){};};
if(typeof CSS!=="undefined"&&typeof CSS.escape!=="function")CSS.escape=function(value){return String(value).replace(/[^a-zA-Z0-9_-]/g,ch=>`\\${ch}`);};
g7ApplyLocale(g7CachedLanguage());
if(window.GroceryEnhancementCore){window.GroceryEnhancementCore.applyLocale=g7ApplyLocale;window.GroceryEnhancementCore.state=g7State;}
