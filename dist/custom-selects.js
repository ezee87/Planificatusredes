// Presentation only: native selects remain the source for options, values, FormData
// and validity. No prototype is patched; value setters are observed per control.
(() => {
  'use strict';
  // Progressive fallback: older browsers keep the complete native control.
  if (!HTMLElement.prototype.showPopover) { window.PlanificaSelects = {enhance(){}}; return; }
  const controls = new WeakMap();
  const observedOptions = new WeakSet();
  let serial = 0, active = null, positionFrame = 0, search = '', searchTime = 0;
  const disabled = option => option.disabled || option.parentElement?.disabled;
  const available = select => [...select.options].filter(option => !option.hidden && !option.parentElement?.hidden);
  const enabled = select => available(select).filter(option => !disabled(option));
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

  function close() {
    if (!active) return;
    const {button, panel} = active;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    button.removeAttribute('aria-controls');
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.remove(); active = null; search = '';
  }

  function position() {
    positionFrame = 0;
    if (!active) return;
    const {select, button, panel} = active;
    if (!select.isConnected || !button.getClientRects().length || button.disabled || button.closest('[inert]')) { close(); return; }
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 8, top = (viewport?.offsetTop || 0) + 8;
    const right = left + (viewport?.width || innerWidth) - 16, bottom = top + (viewport?.height || innerHeight) - 16;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < top || rect.top > bottom) { close(); return; }
    const below = Math.max(0, bottom - rect.bottom - 5), above = Math.max(0, rect.top - top - 5);
    const upward = below < Math.min(panel.scrollHeight, 180) && above > below;
    panel.style.width = Math.min(Math.max(rect.width, 200), right - left) + 'px';
    panel.style.maxHeight = Math.min(320, upward ? above : below) + 'px';
    panel.style.left = Math.max(left, Math.min(rect.left, right - panel.getBoundingClientRect().width)) + 'px';
    panel.style.top = (upward ? rect.top - 5 - panel.getBoundingClientRect().height : rect.bottom + 5) + 'px';
    panel.dataset.direction = upward ? 'up' : 'down';
  }
  const schedulePosition = () => { if (active && !positionFrame) positionFrame = requestAnimationFrame(position); };

  function highlight(option, scroll = true) {
    if (!active || !option) return;
    active.option = option;
    for (const row of active.panel.querySelectorAll('[role=option]')) {
      const current = Number(row.dataset.index) === option.index;
      row.classList.toggle('is-active', current);
      if (current) {
        active.button.setAttribute('aria-activedescendant', row.id);
        if (scroll) row.scrollIntoView({block:'nearest'});
      }
    }
  }

  function renderOptions() {
    if (!active) return;
    const {select, button, panel} = active;
    panel.replaceChildren();
    let previousGroup = null;
    for (const option of available(select)) {
      const group = option.parentElement;
      if (group.tagName === 'OPTGROUP' && group !== previousGroup) {
        const title = document.createElement('div');
        title.className = 'dom-select-group'; title.textContent = group.label; title.setAttribute('role','presentation');
        panel.append(title);
      }
      previousGroup = group;
      const row = document.createElement('div');
      row.id = button.id + '-option-' + option.index;
      row.className = 'dom-select-option'; row.dataset.index = option.index;
      row.setAttribute('role','option'); row.setAttribute('aria-selected', String(option.selected));
      if (disabled(option)) row.setAttribute('aria-disabled','true');
      row.textContent = option.label;
      panel.append(row);
    }
    const next = enabled(select);
    const option = next.includes(active.option) ? active.option : next.find(option => option.selected) || next[0];
    if (option) highlight(option, false);
    else { active.option = null; button.removeAttribute('aria-activedescendant'); }
    schedulePosition();
  }

  function sync(select) {
    const control = controls.get(select); if (!control) return;
    const {button, value, wrapper, error, name} = control;
    const text = select.selectedOptions[0]?.label || '';
    if (value.textContent !== text) value.textContent = text;
    button.disabled = select.matches(':disabled'); wrapper.hidden = select.hidden;
    button.setAttribute('aria-required', String(select.required));
    const labelText = [...select.labels].map(label => {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('select,.dom-select,button,input,textarea').forEach(node => node.remove());
      return copy.textContent.trim();
    }).filter(Boolean).join(' ');
    name.textContent = select.getAttribute('aria-label') || labelText;
    button.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby') || name.id);
    // Keep the original field's visual rules, even when its options are replaced.
    const style = getComputedStyle(select);
    for (const property of ['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','border','borderRadius','paddingTop','paddingBottom','paddingLeft']) button.style[property] = style[property];
    button.style.minHeight = style.minHeight === '0px' ? style.height : style.minHeight;
    if (select.validity.valid) error.hidden = true;
    const invalid = !error.hidden || select.getAttribute('aria-invalid') === 'true';
    if (invalid) button.setAttribute('aria-invalid','true'); else button.removeAttribute('aria-invalid');
    const description = [select.getAttribute('aria-describedby'), !error.hidden && error.id].filter(Boolean).join(' ');
    if (description) button.setAttribute('aria-describedby',description); else button.removeAttribute('aria-describedby');
    for (const option of select.options) {
      if (observedOptions.has(option)) continue;
      observedOptions.add(option);
      const descriptor = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype,'selected');
      Object.defineProperty(option,'selected',{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);const owner=this.closest('select');if(owner)sync(owner);}});
    }
    if (active?.select === select) {
      if (button.disabled || wrapper.hidden) close(); else renderOptions();
    }
  }

  function enhance(root = document) {
    const selects = root.matches?.('select') ? [root] : root.querySelectorAll?.('select') || [];
    for (const select of selects) {
      // There are no multi-select/listbox fields in this app. Netlify's hidden
      // form templates stay untouched; they are metadata, not interactive fields.
      if (select.multiple || select.size > 1 || select.closest('[hidden][aria-hidden="true"]')) continue;
      if (controls.has(select)) { sync(select); continue; }
      const id = select.id ? select.id + '-combobox' : 'dom-select-' + (++serial);
      const wrapper = document.createElement('span'); wrapper.className = 'dom-select';
      const name = document.createElement('span'); name.id = id + '-label'; name.className = 'dom-select-label';
      const button = document.createElement('button'); button.type = 'button'; button.id = id;
      button.className = 'dom-select-button'; button.setAttribute('role','combobox');
      button.setAttribute('aria-haspopup','listbox'); button.setAttribute('aria-expanded','false');
      const value = document.createElement('span'); value.className = 'dom-select-value'; value.id = id + '-value'; button.append(value);
      const error = document.createElement('span'); error.id = id + '-error'; error.className = 'dom-select-error'; error.hidden = true; error.setAttribute('role','alert');
      select.before(wrapper); wrapper.append(select,name,button,error);
      controls.set(select,{button,value,wrapper,error,name});
      select.classList.add('dom-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden','true');
      // Observe property writes synchronously, including value changes without events.
      for (const property of ['value','selectedIndex']) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,property);
        Object.defineProperty(select,property,{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);sync(this);}});
      }
      select.focus = options => button.focus(options);
      button.addEventListener('click',event => { event.preventDefault(); if (active?.select === select) close(); else open(select); });
      for (const label of select.labels) label.addEventListener('click',event => {
        if (event.target.closest('button,input,textarea,a,[role=option]')) return;
        event.preventDefault(); button.focus();
      });
      sync(select);
    }
  }

  function open(select) {
    close(); sync(select);
    const control = controls.get(select); if (!control || control.button.disabled) return;
    const {button} = control;
    const panel = document.createElement('div');
    panel.id = button.id + '-list'; panel.className = 'dom-select-panel'; panel.setAttribute('role','listbox');
    panel.setAttribute('aria-labelledby',button.getAttribute('aria-labelledby'));
    // A DOM popover escapes overflow clipping and remains above native <dialog>.
    // It stays inside that dialog's DOM so the browser's modal inertness is respected.
    panel.setAttribute('popover','manual');
    (button.closest('dialog,[role=dialog]') || document.body).append(panel);
    active = {...control,select,panel,option:null};
    renderOptions(); button.setAttribute('aria-expanded','true'); button.setAttribute('aria-controls',panel.id); button.focus({preventScroll:true});
    panel.showPopover(); position(); highlight(active?.option);
    panel.addEventListener('pointerdown',event => event.preventDefault());
    panel.addEventListener('click',event => {
      const row = event.target.closest('[role=option]');
      if (row && row.getAttribute('aria-disabled') !== 'true') choose(select.options[Number(row.dataset.index)]);
      event.stopPropagation();
    });
  }

  function choose(option) {
    if (!active || !option || disabled(option)) return;
    const {select,button} = active;
    const changed = select.selectedIndex !== option.index;
    close(); select.selectedIndex = option.index; button.focus({preventScroll:true});
    if (changed) {
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  document.addEventListener('keydown',event => {
    const button = event.target.closest('.dom-select-button'); if (!button || button.disabled) return;
    const select = button.parentElement.querySelector('select');
    const keys = ['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape','Tab'];
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') {
      if (active?.select === select) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (!keys.includes(event.key) && (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault(); event.stopPropagation();
    const wasOpen = active?.select === select;
    if (event.altKey && event.key === 'ArrowUp') { close(); return; }
    if (!wasOpen) open(select);
    if (!active) return;
    const options = enabled(select), index = options.indexOf(active.option);
    if (event.key === 'Enter' || event.key === ' ') { if (wasOpen) choose(active.option); return; }
    if (event.key === 'Home' || event.key === 'End') highlight(options[event.key === 'Home' ? 0 : options.length - 1]);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (wasOpen) highlight(options[Math.max(0,Math.min(options.length - 1,index + (event.key === 'ArrowDown' ? 1 : -1)))]);
    } else {
      if (Date.now() - searchTime > 700) search = '';
      search += normalize(event.key); searchTime = Date.now();
      const repeated = [...search].every(letter => letter === search[0]);
      const term = repeated ? search[0] : search;
      const start = repeated ? index + 1 : Math.max(0,index);
      highlight(options.map((_,i) => options[(start+i) % options.length]).find(option => normalize(option.label).startsWith(term)));
    }
  },true);
  document.addEventListener('pointerdown',event => { if (active && !active.button.contains(event.target) && !active.panel.contains(event.target)) close(); },true);
  document.addEventListener('focusin',event => { if (active && event.target !== active.button) close(); });
  document.addEventListener('input',event => { if (event.target.matches('select')) sync(event.target); });
  document.addEventListener('change',event => { if (event.target.matches('select')) sync(event.target); });
  let firstInvalid = null;
  document.addEventListener('invalid',event => {
    // Let an earlier invalid native input keep its normal validation focus.
    if (!firstInvalid) {
      firstInvalid = event.target;
      queueMicrotask(() => { controls.get(firstInvalid)?.button.focus(); firstInvalid = null; });
    }
    const control = controls.get(event.target); if (!control) return;
    event.preventDefault();
    control.error.textContent = event.target.validationMessage; control.error.hidden = false;
    sync(event.target);
  },true);
  document.addEventListener('reset',event => queueMicrotask(() => { if (!event.defaultPrevented) event.target.querySelectorAll('select').forEach(sync); }));
  document.addEventListener('scroll',event => { if (!active?.panel.contains(event.target)) schedulePosition(); },true);
  window.addEventListener('resize',schedulePosition);
  window.visualViewport?.addEventListener('resize',schedulePosition);
  window.visualViewport?.addEventListener('scroll',schedulePosition);
  new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      const select = target?.closest('select'); if (select) changed.add(select);
      if (target?.matches('fieldset') && record.attributeName === 'disabled') target.querySelectorAll('select').forEach(select => changed.add(select));
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
    }
    changed.forEach(sync);
    if (active) schedulePosition();
  }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','required','hidden','open','inert','aria-label','aria-labelledby','aria-describedby','aria-invalid','selected','value','label']});
  window.PlanificaSelects = {enhance};
  enhance();
})();
