"use strict";

let p50LastPrintProfile=null;
const p50RequestWithProfileBase=request;
request=async function(method,path,body,extraHeaders){
  const verb=String(method||"GET").toUpperCase();
  let target=String(path||"");
  if(verb==='GET'&&target.startsWith('/api/v1/grocery/print/document/')&&!target.includes('?')){
    const code=document.querySelector('#print50-form [name=profile]')?.value;
    if(code)target+=`?profile=${encodeURIComponent(code)}`;
  }
  const response=await p50RequestWithProfileBase(method,target,body,extraHeaders);
  if(verb==='GET'&&target.startsWith('/api/v1/grocery/print/document/'))p50LastPrintProfile=unwrap(response)?.profile||null;
  return response;
};

function p50ApplyPrintProfile(root){
  const sheet=root?.querySelector?.('.p50-print-sheet');if(!sheet||!p50LastPrintProfile)return;
  const p=p50LastPrintProfile,c=p.config||{},width=p.widthMm||({A5:148,A4:210,Letter:216}[p.paperSize]||210);
  sheet.style.maxWidth=`${width}mm`;sheet.style.fontSize=`${Math.max(.5,Math.min(2,num(p.fontScale,1)))}em`;
  sheet.style.padding=`${Math.max(0,num(p.marginTopMm,8))}mm ${Math.max(0,num(p.marginRightMm,8))}mm ${Math.max(0,num(p.marginBottomMm,8))}mm ${Math.max(0,num(p.marginLeftMm,8))}mm`;
  const header=sheet.querySelector('header');if(header){const paras=header.querySelectorAll('p');if(c.showAddress===false&&c.showPhone===false&&paras[0])paras[0].style.display='none';if(c.showTaxNumber===false&&paras[1])paras[1].style.display='none';}
  if(c.terms&&!sheet.querySelector('[data-p50-terms]')){const terms=document.createElement('p');terms.dataset.p50Terms='1';terms.innerHTML=`<strong>Terms:</strong> ${esc(c.terms)}`;sheet.querySelector('footer')?.prepend(terms);}
  if(Array.isArray(p.copies)&&p.copies.length&&!sheet.querySelector('[data-p50-copies]')){const badge=document.createElement('small');badge.dataset.p50Copies='1';badge.textContent=`Print copies: ${p.copies.join(', ')}`;sheet.prepend(badge);}
}

function p50ProfileEditor(profiles){
  const rows=(profiles||[]).map(p=>`<option value="${esc(p.code)}">${esc(p.name)} · ${esc(p.paperSize)}</option>`).join('');
  return `<section class="panel p50-no-print" id="p50-profile-editor"><h2>Print Profile Settings</h2><form id="p50-profile-form" class="form-grid form-two"><div class="field"><label>Profile</label><select name="code">${rows}</select></div><div class="field"><label>Name</label><input name="name"></div><div class="field"><label>Paper</label><select name="paperSize"><option>58mm</option><option>80mm</option><option>A5</option><option>A4</option><option>Letter</option></select></div><div class="field"><label>Font Scale</label><input name="fontScale" type="number" min="0.5" max="2" step="0.1"></div><div class="field"><label>Top Margin mm</label><input name="marginTopMm" type="number" min="0"></div><div class="field"><label>Right Margin mm</label><input name="marginRightMm" type="number" min="0"></div><div class="field"><label>Bottom Margin mm</label><input name="marginBottomMm" type="number" min="0"></div><div class="field"><label>Left Margin mm</label><input name="marginLeftMm" type="number" min="0"></div><div class="field span-two"><label>Copies (comma separated)</label><input name="copies" placeholder="Original, Duplicate"></div><label class="check"><input type="checkbox" name="bilingual">Bilingual layout</label><div class="span-two"><strong>Visible fields</strong></div>${['showLogo','showAddress','showPhone','showTaxNumber','showQr','showBarcode','showCashier','showCounter','showCustomer','showInvoiceNumber','showTaxSummary'].map(k=>`<label class="check"><input type="checkbox" name="${k}">${esc(k.replace('show','Show '))}</label>`).join('')}<div class="field span-two"><label>Footer</label><textarea name="footer" rows="2"></textarea></div><div class="field span-two"><label>Terms</label><textarea name="terms" rows="3"></textarea></div><button class="button button-primary span-two">Save Print Profile</button></form></section>`;
}
function p50FillProfileForm(form,p){if(!form||!p)return;const set=(name,value)=>{const e=form.elements[name];if(!e)return;if(e.type==='checkbox')e.checked=value!==false;else e.value=value??'';};set('name',p.name);set('paperSize',p.paperSize);set('fontScale',p.fontScale);set('marginTopMm',p.marginTopMm);set('marginRightMm',p.marginRightMm);set('marginBottomMm',p.marginBottomMm);set('marginLeftMm',p.marginLeftMm);set('copies',(p.copies||[]).join(', '));set('bilingual',p.bilingual);const c=p.config||{};for(const k of ['showLogo','showAddress','showPhone','showTaxNumber','showQr','showBarcode','showCashier','showCounter','showCustomer','showInvoiceNumber','showTaxSummary'])set(k,c[k]);set('footer',c.footer);set('terms',c.terms);}

const p50PrintingBase=printing50;
printing50=async function(){
  await p50PrintingBase();
  const preview=document.getElementById('print50-preview');if(preview){const obs=new MutationObserver(()=>p50ApplyPrintProfile(preview));obs.observe(preview,{childList:true,subtree:true});p50ApplyPrintProfile(preview);}
  if(!(can('settings.manage')))return;
  try{
    const d=unwrap(await get('/api/v1/grocery/print/profiles')),profiles=d?.profiles||[],host=document.querySelector('.grocery-main')||document.querySelector('.main');if(!host||!profiles.length)return;host.insertAdjacentHTML('beforeend',p50ProfileEditor(profiles));const form=document.getElementById('p50-profile-form'),select=form?.elements.code,byCode=new Map(profiles.map(p=>[p.code,p]));const fill=()=>p50FillProfileForm(form,byCode.get(select.value));select?.addEventListener('change',fill);fill();form?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,o=fdObj(f),cfg={};for(const k of ['showLogo','showAddress','showPhone','showTaxNumber','showQr','showBarcode','showCashier','showCounter','showCustomer','showInvoiceNumber','showTaxSummary'])cfg[k]=Boolean(f.elements[k]?.checked);cfg.footer=o.footer||'';cfg.terms=o.terms||'';try{await request('PUT',`/api/v1/grocery/print/profiles/${encodeURIComponent(o.code)}`,{name:o.name,paperSize:o.paperSize,fontScale:num(o.fontScale,1),marginTopMm:num(o.marginTopMm,8),marginRightMm:num(o.marginRightMm,8),marginBottomMm:num(o.marginBottomMm,8),marginLeftMm:num(o.marginLeftMm,8),copies:String(o.copies||'Original').split(',').map(x=>x.trim()).filter(Boolean),bilingual:Boolean(f.elements.bilingual?.checked),config:cfg});printing50();}catch(x){alert(x.message);}});
  }catch(e){console.warn('Print profile editor unavailable',e);}
};

const p50LabelsBase=labels50;
labels50=async function(){await p50LabelsBase();document.querySelector('#label50-form option[value="QR"]')?.remove();};
