/* Axtor POS Cloud — optional Retro POS style switcher.
   Keeps existing data-theme light/dark/blue/minimal behavior untouched. */
(function(){
  'use strict';
  const STORAGE_KEY = 'axtorThemeStyle';
  const RETRO_VALUE = 'retro-pos';
  const DEFAULT_VALUE = 'default';

  function readStyle(){
    try{
      return localStorage.getItem(STORAGE_KEY) === RETRO_VALUE ? RETRO_VALUE : DEFAULT_VALUE;
    }catch(e){
      return DEFAULT_VALUE;
    }
  }

  function persistStyle(style){
    const normalized = style === RETRO_VALUE ? RETRO_VALUE : DEFAULT_VALUE;
    try{ localStorage.setItem(STORAGE_KEY, normalized); }catch(e){}
    applyStyle(normalized);
  }

  function applyStyle(style){
    const enabled = style === RETRO_VALUE;
    document.documentElement.classList.toggle('theme-retro-pos', enabled);
    if(document.body) document.body.classList.toggle('theme-retro-pos', enabled);
    document.querySelectorAll('[data-theme-style-choice]').forEach(function(el){
      const active = (el.getAttribute('data-theme-style-choice') === (enabled ? RETRO_VALUE : DEFAULT_VALUE));
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-theme-style-select]').forEach(function(el){
      el.value = enabled ? RETRO_VALUE : DEFAULT_VALUE;
    });
  }

  function initControls(){
    applyStyle(readStyle());
    document.querySelectorAll('[data-theme-style-choice]').forEach(function(btn){
      btn.setAttribute('type', btn.getAttribute('type') || 'button');
      btn.addEventListener('click', function(){
        persistStyle(btn.getAttribute('data-theme-style-choice'));
      });
    });
    document.querySelectorAll('[data-theme-style-select]').forEach(function(select){
      select.addEventListener('change', function(){ persistStyle(select.value); });
    });
  }

  applyStyle(readStyle());
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initControls);
  }else{
    initControls();
  }

  window.AxtorThemeSwitcher = {
    key: STORAGE_KEY,
    getStyle: readStyle,
    setStyle: persistStyle,
    applyStyle: applyStyle
  };
})();
