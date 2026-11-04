// Mis bonos: three permanent tools built on the app's existing systems.
// Content comes from bonos-data.js (generated from Bonos/*.md). Ideas and posts are
// saved only through the main app's commit(); the weekly checklist uses its own
// localStorage key, like the sidebar preference, and never touches publications.
(() => {
  'use strict';
  const D = window.PlanificaBonosData;
  if (!D) { window.PlanificaBonos = null; return; }
  let api = null;
  const CHECK_KEY = 'planifica-tus-redes-checklist-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const $ = id => document.getElementById(id);
  const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  const EXTRA = {
    book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 12h5"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    quote:'<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/>'
  };
  const ic = name => EXTRA[name] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${EXTRA[name]}</svg>` : api.icon(name);

  const IDEAS = D.ideas.items, CATS = D.ideas.categories;
  const STAGES = D.guide.stages, TIPS = STAGES.flatMap(stage => stage.tips.map(tip => ({...tip, stage})));
  const DAYS = D.guide.checklist.days, TASK_IDS = new Set(DAYS.flatMap(day => day.tasks.map(task => task.id)));
  const TASK_TOTAL = TASK_IDS.size;
  const CALS = D.calendars.items;
  const postsOf = cal => cal.weeks.flatMap(week => week.posts.map(post => ({...post, theme:week.theme})));
  const catLabel = id => CATS.find(c => c.id === id)?.label || '';
  const catId = text => { const t = text.replace(/\.$/, '').trim(); return CATS.find(c => c.label === t)?.id || 'educativo'; };
  const noDot = text => text.replace(/\.$/, '');
  const capital = text => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
  const view = {screen:'home', filter:'all', ideaId:null, tipId:null, calendarId:null};

  const BONOS = [
    {screen:'ideas', num:'01', title:'30 ideas de contenido', desc:'Encontrá inspiración y adaptá propuestas a tus clientes', action:'Explorar ideas', icon:'lightbulb', tone:'amber', facts:['30 ideas','5 categorías']},
    {screen:'guide', num:'02', title:'Guía de organización', desc:'Aprendé a organizar tu trabajo y mantené el control de tus publicaciones', action:'Ver guía', icon:'book', tone:'green', facts:['10 consejos','Checklist semanal']},
    {screen:'calendars', num:'03', title:'Calendarios de ejemplo', desc:'Explorá planificaciones completas y adaptalas a tus clientes', action:'Explorar calendarios', icon:'calendar', tone:'blue', facts:['3 calendarios','36 publicaciones']}
  ];

  // ---------- Markdown (subset used by the bonus files) ----------
  const inline = text => esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]\n]{1,90})\]/g, '<span class="bono-slot">[$1]</span>');
  function md(text, level = 3) {
    const lines = String(text || '').split('\n'), out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`<ul class="bono-list">${list.join('')}</ul>`); list = null; } };
    const nextFilled = i => { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; return lines[j]?.trim() || ''; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { if (!(list && nextFilled(i).startsWith('- '))) flush(); continue; }
      if (line.startsWith('- ')) { (list ||= []).push(`<li>${inline(line.slice(2))}</li>`); continue; }
      flush();
      const whole = line.match(/^\*\*([^*]+)\*\*$/);
      if (whole) { out.push(whole[1].length > 70 ? `<p class="bono-strong">${inline(whole[1])}</p>` : `<h${level} class="bono-subhead">${inline(whole[1])}</h${level}>`); continue; }
      const italic = line.match(/^\*([^*].*[^*])\*$/);
      if (italic) { out.push(`<p class="bono-note"><em>${inline(italic[1])}</em></p>`); continue; }
      if (line.startsWith('«')) { out.push(`<p class="bono-quote">${inline(line)}</p>`); continue; }
      if (line.endsWith(':') && line.length < 70) { out.push(`<p class="bono-leadin">${inline(line)}</p>`); continue; }
      out.push(`<p>${inline(line)}</p>`);
    }
    flush();
    return out.join('');
  }
  // Plain text for the caption textarea of saved content.
  function plain(text) {
    const lines = String(text || '').split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
        const prev = out[out.length - 1];
        if (prev === undefined || prev === '' || (prev.startsWith('- ') && lines[j]?.trim().startsWith('- '))) continue;
        out.push(''); continue;
      }
      out.push(line.replace(/\*\*/g, '').replace(/^\*([^*].*[^*])\*$/, '$1'));
    }
    return out.join('\n').trim();
  }
  function typeFor(format) {
    const first = format.split('. ')[0].toLocaleLowerCase('es');
    const hits = [['reel','reel'],['carrusel','carrusel'],['historia','historia'],['publicación estática','post'],['video','video']]
      .map(([word, type]) => [first.indexOf(word), type]).filter(([at]) => at >= 0).sort((a, b) => a[0] - b[0]);
    return hits[0]?.[1] || 'post';
  }

  // ---------- Shared helpers ----------
  const state = () => api.state;
  const clientOf = id => state().clients.find(c => c.id === id);
  const accountsOf = clientId => state().accounts.filter(a => a.clientId === clientId);
  const defaultClient = () => {
    const s = state();
    if (s.clientFilter !== 'all' && clientOf(s.clientFilter)) return s.clientFilter;
    return s.clients.find(c => c.id !== api.PERSONAL)?.id || api.PERSONAL;
  };
  const sameText = (a, b) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');
  const sameTarget = (item, target) => target.accountId ? item.accountId === target.accountId : (!item.accountId && item.platform === target.platform);
  const exists = (clientId, date, title, target) => state().items.some(x => x.clientId === clientId && (x.date || null) === (date || null) && sameText(x.title, title) && sameTarget(x, target));
  const targetName = target => { const account = state().accounts.find(a => a.id === target.accountId); return account ? api.accountLabel(account) : `${api.PLATFORM[target.platform]} (sin cuenta específica)`; };
  const typeOptions = selected => Object.entries(api.TYPES).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const platformOptions = selected => Object.entries(api.PLATFORM).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const clientOptions = selected => state().clients.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const shortDate = key => new Intl.DateTimeFormat('es-ES', {weekday:'short', day:'numeric', month:'short'}).format(api.parseDate(key));
  const longDate = key => capital(new Intl.DateTimeFormat('es-ES', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(api.parseDate(key)));
  const MONTHS = Array.from({length:12}, (_, m) => capital(new Intl.DateTimeFormat('es-ES', {month:'long'}).format(new Date(2026, m, 1, 12))));

  function crumbs(list) {
    return `<nav class="bono-breadcrumb" aria-label="Ruta de navegación"><ol>${list.map(([label, screen, attrs = ''], i) => `<li>${i < list.length - 1 ? `<button type="button" class="bono-crumb" data-bono="go" data-screen="${screen}" ${attrs}>${esc(label)}</button>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join('')}</ol></nav>`;
  }
  const idea = () => IDEAS.find(x => x.id === view.ideaId);
  const tip = () => TIPS.find(x => x.id === view.tipId);
  const calendar = () => CALS.find(x => x.id === view.calendarId);
  function screen() {
    if (view.screen === 'idea' && !idea()) view.screen = 'ideas';
    if (view.screen === 'tip' && !tip()) view.screen = 'guide';
    if (view.screen === 'calendar' && !calendar()) view.screen = 'calendars';
    return view.screen;
  }

  // ---------- Header ----------
  function header() {
    const s = screen();
    let path = [], eyebrow = 'Mis bonos', title = 'Tus herramientas extra para planificar mejor', lead = 'Tres recursos prácticos para encontrar inspiración, organizar tu trabajo y preparar contenido para tus clientes.';
    if (s === 'ideas') { path = [['Mis bonos','home'],['30 ideas de contenido']]; eyebrow = 'Bono 1'; title = '30 ideas de contenido'; lead = 'Encontrá inspiración y adaptá propuestas a tus clientes.'; }
    if (s === 'idea') { const i = idea(); path = [['Mis bonos','home'],['30 ideas de contenido','ideas'],['Idea ' + i.number]]; eyebrow = `Bono 1 · Idea ${i.number}`; title = i.title; lead = ''; }
    if (s === 'guide') { path = [['Mis bonos','home'],['Guía de organización']]; eyebrow = 'Bono 2 · Guía de organización'; title = D.guide.title; lead = D.guide.subtitle; }
    if (s === 'tip') { const t = tip(); path = [['Mis bonos','home'],['Guía de organización','guide'],['Consejo ' + t.number]]; eyebrow = `Etapa ${t.stage.number} · ${t.stage.title}`; title = t.title; lead = `Consejo ${t.number} de ${TIPS.length}`; }
    if (s === 'checklist') { path = [['Mis bonos','home'],['Guía de organización','guide'],['Checklist semanal']]; eyebrow = 'Bono 2 · Guía de organización'; title = D.guide.checklist.title; lead = D.guide.checklist.subtitle; }
    if (s === 'calendars') { path = [['Mis bonos','home'],['Calendarios de ejemplo']]; eyebrow = 'Bono 3'; title = D.calendars.title; lead = D.calendars.subtitle; }
    if (s === 'calendar') { const c = calendar(); path = [['Mis bonos','home'],['Calendarios de ejemplo','calendars'],[c.sector]]; eyebrow = `Bono 3 · ${c.heading.replace(/^CALENDARIO (\d+) — .*/, 'Calendario $1')}`; title = `${c.sector} — ${c.business}`; lead = 'Ejemplo: ' + c.example; }
    return `<div class="bono-page-head">${path.length ? crumbs(path) : ''}<p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</div>`;
  }

  // ---------- Screens ----------
  function others(current) {
    return `<section class="bono-others" aria-labelledby="bono-others-title"><h2 id="bono-others-title">Seguí explorando tus bonos</h2><div class="bono-others-grid">${BONOS.filter(b => b.screen !== current).map(b => `<button type="button" class="bono-other tone-${b.tone}" data-bono="go" data-screen="${b.screen}"><span class="bono-icon">${ic(b.icon)}</span><span class="bono-other-text"><strong>${esc(b.title)}</strong><small>${esc(b.desc)}</small></span>${api.icon('arrow')}</button>`).join('')}</div></section>`;
  }
  function home() {
    return `<div class="bono-home"><div class="bono-card-grid">${BONOS.map(b => `<article class="bono-card tone-${b.tone}" aria-labelledby="bono-card-${b.num}"><div class="bono-card-top"><span class="bono-icon bono-icon-lg">${ic(b.icon)}</span><span class="bono-kicker">Bono ${b.num}</span></div><h2 id="bono-card-${b.num}">${esc(b.title)}</h2><p>${esc(b.desc)}</p><ul class="bono-facts" aria-label="Incluye">${b.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul><button type="button" class="btn btn-primary" data-bono="go" data-screen="${b.screen}" id="bono-open-${b.screen}">${esc(b.action)} ${api.icon('arrow')}</button></article>`).join('')}</div></div>`;
  }

  // Bono 1
  const visibleIdeas = () => IDEAS.filter(i => view.filter === 'all' || i.category === view.filter);
  const ideaCount = n => `Mostrando ${n} ${n === 1 ? 'idea' : 'ideas'}${view.filter === 'all' ? '' : ' de ' + catLabel(view.filter)}`;
  function ideasScreen() {
    const filters = [['all','Todas',IDEAS.length], ...CATS.map(c => [c.id, c.label, IDEAS.filter(i => i.category === c.id).length])];
    return `<div class="bono-ideas"><div class="bono-toolbar"><div class="bono-filters" role="group" aria-label="Filtrar ideas por categoría">${filters.map(([id, label, n]) => `<button type="button" class="bono-filter ${id === 'all' ? '' : 'cat-' + id}" data-bono="filter" data-filter="${id}" aria-pressed="${view.filter === id}">${esc(label)}<span aria-hidden="true">${n}</span></button>`).join('')}</div><p class="bono-count" id="bono-idea-count" role="status" aria-live="polite">${ideaCount(visibleIdeas().length)}</p></div><div class="bono-idea-grid">${IDEAS.map(i => {
      const type = api.TYPES[typeFor(i.format)];
      return `<article class="bono-idea-card cat-${i.category}" data-category="${i.category}" ${view.filter === 'all' || view.filter === i.category ? '' : 'hidden'} aria-labelledby="bono-idea-title-${i.number}"><div class="bono-idea-top"><span class="bono-num" aria-hidden="true">${i.number}</span><span class="bono-cat cat-${i.category}">${esc(catLabel(i.category))}</span></div><h2 id="bono-idea-title-${i.number}">${esc(i.title)}</h2><dl class="bono-idea-meta"><div><dt>Formato</dt><dd>${esc(type)}</dd></div>${i.duration ? `<div><dt>Duración</dt><dd>${esc(i.duration)}</dd></div>` : ''}</dl><button type="button" class="text-btn bono-more" data-bono="idea" data-id="${i.id}" id="bono-view-${i.id}" aria-label="Ver idea ${i.number}: ${esc(i.title)}">Ver idea ${api.icon('arrow')}</button></article>`;
    }).join('')}</div>${others('ideas')}</div>`;
  }
  function applyFilter(id) {
    if (id !== 'all' && !CATS.some(c => c.id === id)) return;
    view.filter = id;
    document.querySelectorAll('[data-bono="filter"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === id)));
    document.querySelectorAll('.bono-idea-card').forEach(card => { card.hidden = !(id === 'all' || card.dataset.category === id); });
    const count = $('bono-idea-count'); if (count) count.textContent = ideaCount(visibleIdeas().length);
  }
  const SECTIONS = ['Objetivo y formato recomendado','Modelo narrativo','Plantilla adaptable','Ejemplo práctico','Cómo adaptarla a otros clientes'];
  function toc(label, items) {
    return `<nav class="bono-toc" aria-label="${esc(label)}"><ol>${items.map(([target, text, num]) => `<li><button type="button" data-bono="jump" data-target="${target}">${num ? `<span aria-hidden="true">${num}</span>` : ''}${esc(text)}</button></li>`).join('')}</ol></nav>`;
  }
  function pager(prev, next, label) {
    const cell = (item, dir) => item ? `<button type="button" class="bono-pager-btn is-${dir}" data-bono="${item.action}" data-id="${esc(item.id || '')}" ${item.screen ? `data-screen="${item.screen}"` : ''}>${api.icon(dir === 'prev' ? 'left' : 'right')}<span><small>${dir === 'prev' ? 'Anterior' : 'Siguiente'}</small><strong>${esc(item.label)}</strong></span></button>` : '<span></span>';
    return `<nav class="bono-pager" aria-label="${esc(label)}">${cell(prev, 'prev')}${cell(next, 'next')}</nav>`;
  }
  function ideaScreen() {
    const i = idea(), index = IDEAS.indexOf(i), type = api.TYPES[typeFor(i.format)];
    const steps = i.model.split('→').map(s => noDot(s.trim()));
    const sec = (n, body, extra = '') => `<section class="bono-section ${extra}" id="bono-sec-${n}" aria-labelledby="bono-sec-${n}-title"><h2 id="bono-sec-${n}-title" tabindex="-1"><span class="bono-sec-num" aria-hidden="true">${n}</span>${SECTIONS[n - 1]}</h2>${body}</section>`;
    const prev = IDEAS[index - 1], next = IDEAS[index + 1];
    return `<div class="bono-detail"><section class="bono-hero cat-${i.category}" aria-label="Resumen de la idea"><div class="bono-hero-tags"><span class="bono-cat cat-${i.category}">${esc(catLabel(i.category))}</span><span class="bono-tag">${ic('layers')} ${esc(type)}</span>${i.duration ? `<span class="bono-tag">${api.icon('clock')} ${esc(i.duration)}</span>` : ''}</div><div class="bono-hero-body"><p class="bono-hero-text">Guardala en el Banco de ideas de un cliente con el objetivo, el formato, la estructura narrativa y las indicaciones de desarrollo. Después podés editarla y planificarla como cualquier otra idea.</p><button type="button" class="btn btn-primary" data-bono="add-idea" data-id="${i.id}" id="bono-add-idea">${api.icon('plus')} Agregar al Banco de ideas</button></div></section>${toc('Apartados de la idea', SECTIONS.map((s, n) => ['bono-sec-' + (n + 1), s, n + 1]))}<article class="bono-sections">${sec(1, `<div class="bono-two"><div class="bono-fact"><h3>Objetivo</h3><p>${inline(capital(i.objective))}</p></div><div class="bono-fact"><h3>Formato recomendado</h3><p>${inline(capital(i.format))}</p></div></div>`)}${sec(2, `<ol class="bono-flow" aria-label="${esc(i.model)}">${steps.map((s, n) => `<li><span class="bono-flow-num" aria-hidden="true">${n + 1}</span>${esc(s)}</li>`).join('')}</ol>`)}${sec(3, md(i.template))}${sec(4, `<p class="bono-ref"><span>${api.icon('info')}</span>Ejemplo de referencia de otro negocio. No se copia al guardar la idea: adaptalo a tu cliente.</p><div class="bono-example">${md(i.example)}</div>`, 'is-example')}${sec(5, md(i.adapt))}</article><div class="bono-detail-cta"><p>¿Te sirve esta idea para alguno de tus clientes?</p><button type="button" class="btn btn-primary" data-bono="add-idea" data-id="${i.id}" id="bono-add-idea-end">${api.icon('plus')} Agregar al Banco de ideas</button></div>${pager(prev && {action:'idea', id:prev.id, label:`${prev.number}. ${prev.title}`}, next && {action:'idea', id:next.id, label:`${next.number}. ${next.title}`}, 'Otras ideas')}</div>`;
  }

  // Bono 2
  function checklistState() {
    const week = api.startWeek(api.today());
    try {
      const raw = JSON.parse(localStorage.getItem(CHECK_KEY) || 'null');
      if (raw && typeof raw === 'object' && raw.week === week && Array.isArray(raw.done)) return {week, done:new Set(raw.done.filter(id => typeof id === 'string' && TASK_IDS.has(id)))};
    } catch {}
    return {week, done:new Set()};
  }
  function saveChecklist(check) {
    try { localStorage.setItem(CHECK_KEY, JSON.stringify({week:check.week, done:[...check.done]})); return true; }
    catch { api.notify('No se pudo guardar el progreso de la checklist. Revisá el almacenamiento del navegador.', true); return false; }
  }
  function progressBar(done, id = '') {
    const pct = Math.round(done / TASK_TOTAL * 100);
    return `<div class="bono-bar" ${id ? `id="${id}"` : ''} role="progressbar" aria-label="Tareas completadas esta semana" aria-valuemin="0" aria-valuemax="${TASK_TOTAL}" aria-valuenow="${done}" aria-valuetext="${done} de ${TASK_TOTAL} tareas"><span style="width:${pct}%"></span></div>`;
  }
  function guideScreen() {
    const check = checklistState();
    return `<div class="bono-guide"><section class="bono-intro">${md(D.guide.intro)}</section><section class="bono-feature" aria-labelledby="bono-feature-title"><span class="bono-icon bono-icon-lg">${ic('list')}</span><div class="bono-feature-text"><h2 id="bono-feature-title">${esc(D.guide.checklist.title)}</h2><p>${esc(D.guide.checklist.subtitle)}. Marcá tus tareas de lunes a viernes: el progreso se guarda durante la semana.</p><div class="bono-feature-progress"><strong>${check.done.size} de ${TASK_TOTAL}</strong><span>tareas completadas esta semana</span></div>${progressBar(check.done.size)}</div><button type="button" class="btn btn-primary" data-bono="go" data-screen="checklist" id="bono-open-checklist">Abrir checklist ${api.icon('arrow')}</button></section><section aria-labelledby="bono-stages-title"><h2 class="bono-section-title" id="bono-stages-title">Las cuatro etapas de la guía</h2><div class="bono-stage-grid">${STAGES.map(stage => `<article class="bono-stage" aria-labelledby="bono-stage-${stage.number}"><p class="bono-kicker">Etapa ${stage.number}</p><h3 id="bono-stage-${stage.number}">${esc(stage.title)}</h3><div class="bono-stage-intro">${md(stage.intro)}</div><ol class="bono-tip-links">${stage.tips.map(t => `<li><button type="button" data-bono="tip" data-id="${t.id}" id="bono-tip-link-${t.number}"><span class="bono-num" aria-hidden="true">${t.number}</span><span>${esc(t.title)}</span>${api.icon('arrow')}</button></li>`).join('')}</ol></article>`).join('')}</div></section><section class="bono-closing" aria-labelledby="bono-closing-title"><h2 id="bono-closing-title">${esc(D.guide.closing.title)}</h2>${md(D.guide.closing.body)}</section>${others('guide')}</div>`;
  }
  function tipScreen() {
    const t = tip(), index = TIPS.indexOf(t), prev = TIPS[index - 1], next = TIPS[index + 1];
    const block = (title, body, cls = '', iconName = '') => `<section class="bono-block ${cls}"><h2>${iconName ? `<span class="bono-block-icon">${ic(iconName)}</span>` : ''}${esc(title)}</h2>${md(body)}</section>`;
    return `<div class="bono-tip-view"><nav class="bono-stage-tabs" aria-label="Etapas de la guía">${STAGES.map(stage => `<button type="button" data-bono="tip" data-id="${stage.tips[0].id}" ${stage === t.stage ? 'aria-current="true"' : ''}><span>Etapa ${stage.number}</span><strong>${esc(stage.title)}</strong></button>`).join('')}</nav><nav class="bono-tip-chips" aria-label="Consejos de la etapa ${t.stage.number}">${t.stage.tips.map(x => `<button type="button" data-bono="tip" data-id="${x.id}" ${x === t ? 'aria-current="page"' : ''}><span aria-hidden="true">${x.number}</span>${esc(x.title)}</button>`).join('')}</nav><article class="bono-tip"><div class="bono-tip-pair">${block('Qué hacer', t.what, '', 'check')}${block('Por qué funciona', t.why, '', 'info')}</div>${block('Cómo aplicarlo', t.how, 'is-wide', 'layers')}<section class="bono-app-callout"><span class="bono-app-mark">${api.icon('logo')}</span><div><h2>Aplicalo en Planifica tus redes</h2>${md(t.app)}</div></section><section class="bono-habit"><span class="bono-block-icon">${ic('star')}</span><div><h2>Hábito recomendado</h2><p>${inline(capital(t.habit))}</p></div></section></article>${pager(prev && {action:'tip', id:prev.id, label:`${prev.number}. ${prev.title}`}, next ? {action:'tip', id:next.id, label:`${next.number}. ${next.title}`} : {action:'go', screen:'checklist', label:'Tu checklist semanal'}, 'Otros consejos')}</div>`;
  }
  function checklistScreen() {
    const check = checklistState(), todayIndex = (api.parseDate(api.today()).getDay() + 6) % 7;
    const friday = api.dateKey(new Date(api.parseDate(check.week).getTime() + 4 * 864e5));
    const range = `${new Intl.DateTimeFormat('es-ES', {weekday:'long', day:'numeric', month:'long'}).format(api.parseDate(check.week))} al ${new Intl.DateTimeFormat('es-ES', {weekday:'long', day:'numeric', month:'long'}).format(api.parseDate(friday))}`;
    return `<div class="bono-checklist" data-week="${check.week}"><section class="bono-progress" aria-labelledby="bono-progress-title"><div class="bono-progress-head"><div><h2 id="bono-progress-title">Tu progreso semanal</h2><p>Semana del ${esc(range)}</p></div><p class="bono-progress-count" id="bono-check-count" aria-live="polite"><strong>${check.done.size}</strong><span>/ ${TASK_TOTAL} tareas completadas</span></p></div>${progressBar(check.done.size, 'bono-check-bar')}<div class="bono-progress-foot"><p>El progreso se guarda en este navegador durante la semana. Cada lunes empieza una checklist nueva. Marcar tareas no modifica tus publicaciones.</p><button type="button" class="btn btn-outline" data-bono="checklist-reset" id="bono-check-reset" ${check.done.size ? '' : 'disabled'}>Reiniciar semana</button></div></section><div class="bono-intro bono-intro-compact">${md(D.guide.checklist.intro)}</div><div class="bono-days">${DAYS.map((day, d) => {
      const done = day.tasks.filter(task => check.done.has(task.id)).length;
      return `<section class="bono-day ${d === todayIndex ? 'is-today' : ''}" aria-labelledby="bono-day-${day.id}"><header><div class="bono-day-top"><span class="bono-day-name">${esc(day.day)}</span>${d === todayIndex ? '<span class="bono-today">Hoy</span>' : ''}<span class="bono-day-count" id="bono-day-count-${day.id}">${done}/${day.tasks.length}</span></div><h2 id="bono-day-${day.id}">${esc(day.focus)}</h2><p><strong>Objetivo:</strong> ${inline(day.objective)}</p></header><ul class="bono-tasks">${day.tasks.map(task => `<li><label class="bono-task"><input type="checkbox" data-bono-task="${task.id}" ${check.done.has(task.id) ? 'checked' : ''}><span class="bono-check" aria-hidden="true">${api.icon('check')}</span><span>${esc(task.text)}</span></label></li>`).join('')}</ul></section>`;
    }).join('')}</div><p class="bono-back-line"><button type="button" class="text-btn" data-bono="go" data-screen="guide">${api.icon('left')} Volver a la guía de organización</button></p></div>`;
  }
  function updateChecklistUI(check) {
    const count = $('bono-check-count'); if (count) count.innerHTML = `<strong>${check.done.size}</strong><span>/ ${TASK_TOTAL} tareas completadas</span>`;
    const bar = $('bono-check-bar'); if (bar) { bar.setAttribute('aria-valuenow', check.done.size); bar.setAttribute('aria-valuetext', `${check.done.size} de ${TASK_TOTAL} tareas`); bar.firstElementChild.style.width = Math.round(check.done.size / TASK_TOTAL * 100) + '%'; }
    DAYS.forEach(day => { const el = $('bono-day-count-' + day.id); if (el) el.textContent = `${day.tasks.filter(t => check.done.has(t.id)).length}/${day.tasks.length}`; });
    const reset = $('bono-check-reset'); if (reset) reset.disabled = !check.done.size;
  }
  function toggleTask(input) {
    const id = input.dataset.bonoTask; if (!TASK_IDS.has(id)) return;
    const check = checklistState();
    // A new week started while the screen was open: show the fresh checklist instead.
    if (input.closest('.bono-checklist')?.dataset.week !== check.week) { api.render(); api.notify('Comenzó una nueva semana: tu checklist empieza de cero.'); return; }
    if (input.checked) check.done.add(id); else check.done.delete(id);
    if (!saveChecklist(check)) { input.checked = !input.checked; return; }
    updateChecklistUI(check);
  }
  function resetChecklist() {
    const check = checklistState();
    if (!check.done.size) return;
    api.manager('Reiniciar semana', `<p>Se desmarcarán las ${check.done.size} tareas completadas de esta semana.</p><p class="field-help">Esta acción solo afecta a la checklist. No modifica publicaciones, ideas ni clientes.</p>`, () => {
      if (!saveChecklist({week:check.week, done:new Set()})) return false;
      api.render(); api.notify('Checklist reiniciada. Empezás la semana de cero.'); return true;
    }, 'Reiniciar semana', true);
  }

  // Bono 3
  function calendarsScreen() {
    return `<div class="bono-calendars"><section class="bono-intro">${md(D.calendars.intro)}</section><div class="bono-cal-grid">${CALS.map((c, n) => `<article class="bono-card bono-cal-card tone-${['amber','green','blue'][n]}" aria-labelledby="bono-cal-${c.id}"><div class="bono-card-top"><span class="bono-icon bono-icon-lg">${api.icon('calendar')}</span><span class="bono-kicker">Calendario 0${n + 1}</span></div><p class="bono-sector">${esc(c.sector)}</p><h2 id="bono-cal-${c.id}">${esc(c.business)}</h2><p class="bono-cal-example">Ejemplo: ${esc(c.example)}</p><dl class="bono-cal-facts"><div><dt>Publicaciones</dt><dd>${postsOf(c).length}</dd></div><div><dt>Duración</dt><dd>${esc(capital(noDot(c.duration)))}</dd></div><div><dt>Frecuencia</dt><dd>${esc(capital(noDot(c.frequency)))}</dd></div></dl><button type="button" class="btn btn-primary" data-bono="calendar" data-id="${c.id}" id="bono-cal-open-${c.id}">Explorar calendario ${api.icon('arrow')}</button></article>`).join('')}</div><section class="bono-closing" aria-labelledby="bono-usage-title"><h2 id="bono-usage-title">${esc(D.calendars.usage.title)}</h2>${md(D.calendars.usage.body)}</section>${others('calendars')}</div>`;
  }
  function calendarScreen() {
    const c = calendar();
    return `<div class="bono-cal-detail"><section class="bono-hero" aria-label="Resumen del calendario"><dl class="bono-cal-meta"><div class="is-goal"><dt>Objetivo general</dt><dd>${inline(capital(c.goal))}</dd></div><div><dt>Frecuencia</dt><dd>${esc(capital(c.frequency))}</dd></div><div><dt>Distribución</dt><dd>${esc(capital(c.distribution))}</dd></div><div><dt>Duración</dt><dd>${esc(capital(c.duration))}</dd></div></dl><div class="bono-hero-body"><p class="bono-hero-text">Incorporá las 12 publicaciones a un cliente en un mes concreto. Vas a revisar las fechas antes de confirmar y no se modifica ningún contenido existente.</p><button type="button" class="btn btn-primary" data-bono="use-calendar" data-id="${c.id}" id="bono-use-calendar">${api.icon('calendar')} Usar este calendario</button></div></section>${toc('Semanas del calendario', c.weeks.map(w => ['bono-week-' + w.number, 'Semana ' + w.number]))}${c.weeks.map(w => `<section class="bono-week" id="bono-week-${w.number}" aria-labelledby="bono-week-${w.number}-title"><h2 id="bono-week-${w.number}-title" tabindex="-1"><span class="bono-week-num">Semana ${w.number}</span>${esc(w.theme)}</h2><div class="bono-post-grid">${w.posts.map(p => `<article class="bono-post" aria-labelledby="bono-post-${p.id}"><header class="bono-post-head"><span class="bono-day-badge">${esc(p.day)}</span><span class="bono-post-num">Publicación ${p.number}</span></header><h3 id="bono-post-${p.id}">${esc(p.topic)}</h3><span class="bono-cat cat-${catId(p.category)}">${esc(noDot(p.category))}</span><dl class="bono-post-dl"><div><dt>Formato</dt><dd>${esc(capital(p.format))}</dd></div><div><dt>Objetivo</dt><dd>${inline(capital(p.objective))}</dd></div></dl><div class="bono-post-dev"><h4>Desarrollo sugerido</h4>${md(p.development, 5)}</div><p class="bono-cta"><span>CTA</span>${inline(p.cta)}</p><button type="button" class="btn btn-outline bono-post-add" data-bono="add-post" data-id="${p.id}" id="bono-add-${p.id}" aria-label="Agregar a mi planificación: publicación ${p.number}, ${esc(p.topic)}">${api.icon('plus')} Agregar a mi planificación</button></article>`).join('')}</div></section>`).join('')}<div class="bono-detail-cta"><p>¿Querés usar el calendario completo para un cliente?</p><button type="button" class="btn btn-primary" data-bono="use-calendar" data-id="${c.id}" id="bono-use-calendar-end">${api.icon('calendar')} Usar este calendario</button></div>${others('calendars')}</div>`;
  }

  // ---------- Saving: ideas and posts (existing item model, one network per record) ----------
  function ideaCaption(i) {
    return `OBJETIVO\n${capital(i.objective)}\n\nFORMATO SUGERIDO\n${capital(i.format)}\n\nESTRUCTURA NARRATIVA\n${i.model}\n\nINDICACIONES DE DESARROLLO\n${plain(i.template)}\n\nBasada en: Mis bonos · 30 ideas de contenido · Idea ${i.number}.`;
  }
  function postCaption(cal, p) {
    return `Tema: ${p.topic}\nCategoría: ${p.category}\nFormato: ${capital(p.format)}\nObjetivo: ${capital(p.objective)}\n\nDesarrollo sugerido:\n${plain(p.development)}\n\nCTA: ${p.cta}\n\nBasada en: Mis bonos · Calendarios de ejemplo · ${cal.sector} — ${cal.business} · Semana ${p.week}, publicación ${p.number} (${p.day.toLocaleLowerCase('es')}).`;
  }
  const postTitle = p => noDot(p.topic).slice(0, 120);
  function targetFields(p, clientId) {
    return `<div class="bono-form-row"><div class="field"><label for="${p}-client">Cliente</label><select id="${p}-client">${clientOptions(clientId)}</select></div><div class="field"><label for="${p}-account">Red social del cliente</label><select id="${p}-account"></select><p class="field-help" id="${p}-account-hint"></p></div></div><div class="field" id="${p}-platform-field"><label for="${p}-platform">Red social</label><select id="${p}-platform">${platformOptions('instagram')}</select></div>`;
  }
  function bindTarget(p, onChange) {
    const client = $(p + '-client'), account = $(p + '-account'), platform = $(p + '-platform');
    const sync = () => {
      const acc = accountsOf(client.value).find(a => a.id === account.value);
      $(p + '-platform-field').hidden = !!acc; platform.disabled = !!acc; if (acc) platform.value = acc.platform;
      onChange?.();
    };
    const fill = () => {
      const list = accountsOf(client.value);
      account.innerHTML = list.map(a => `<option value="${esc(a.id)}">${esc(api.accountLabel(a))}</option>`).join('') + '<option value="">Sin cuenta específica</option>';
      account.value = list[0]?.id || '';
      $(p + '-account-hint').textContent = list.length ? 'Se muestran las cuentas asociadas a este cliente.' : 'Este cliente no tiene cuentas registradas. Elegí una red social; podés agregar cuentas desde Clientes y cuentas.';
      sync();
    };
    client.addEventListener('change', fill); account.addEventListener('change', sync); platform.addEventListener('change', () => onChange?.());
    fill();
  }
  function readTarget(p) {
    const clientId = $(p + '-client').value, acc = accountsOf(clientId).find(a => a.id === $(p + '-account').value);
    return {clientId, accountId:acc?.id || null, platform:acc ? acc.platform : $(p + '-platform').value};
  }
  // The shared dialog can be reopened before a previous "close" event is delivered;
  // close handlers therefore ignore events that arrive while the dialog is open again.
  function widen() { const dialog = $('manager-dialog'); dialog.classList.add('bono-dialog'); const off = () => { if (dialog.open) return; dialog.classList.remove('bono-dialog'); dialog.removeEventListener('close', off); }; dialog.addEventListener('close', off); }
  function newItem({title, caption, type, date, target}) {
    const now = new Date().toISOString();
    return {id:api.uid(), title:title.slice(0, 120), caption:caption.slice(0, 20000), platform:target.platform, type, status:'idea', date:date || null, clientId:target.clientId, accountId:target.accountId, createdAt:now, updatedAt:now};
  }
  function validTarget(target) {
    if (!clientOf(target.clientId)) return false;
    if (target.accountId) { const acc = state().accounts.find(a => a.id === target.accountId); return !!acc && acc.clientId === target.clientId && acc.platform === target.platform; }
    return Object.hasOwn(api.PLATFORM, target.platform);
  }
  function addIdea(id) {
    const i = IDEAS.find(x => x.id === id); if (!i) return;
    api.manager('Agregar al Banco de ideas', `<p class="bono-dialog-lead"><span class="bono-cat cat-${i.category}">${esc(catLabel(i.category))}</span> Idea ${i.number} · ${esc(i.title)}</p>${targetFields('bono-idea', defaultClient())}<div class="field"><label for="bono-idea-title">Título *</label><input id="bono-idea-title" maxlength="120" required autocomplete="off" value="${esc(i.title)}"></div><div class="field"><label for="bono-idea-type">Tipo de contenido</label><select id="bono-idea-type">${typeOptions(typeFor(i.format))}</select></div><div class="field"><label for="bono-idea-text">Contenido que se guardará</label><textarea id="bono-idea-text" class="bono-preview-text" maxlength="20000" aria-describedby="bono-idea-text-help">${esc(ideaCaption(i))}</textarea><p class="field-help" id="bono-idea-text-help">Incluye objetivo, formato sugerido, estructura narrativa e indicaciones de desarrollo. Podés editarlo ahora o después. El ejemplo práctico no se copia: sigue disponible en el bono.</p></div><p class="bono-warning" id="bono-idea-warning" role="status" hidden></p><p class="field-help">Se guardará sin fecha, con estado «${esc(api.STATUS.idea)}», en el Banco de ideas.</p>`, () => {
      const titleInput = $('bono-idea-title'), title = titleInput.value.trim();
      if (!title) { titleInput.setAttribute('aria-invalid', 'true'); titleInput.focus(); api.notify('Escribí un título para la idea.', true); return false; }
      const target = readTarget('bono-idea');
      if (!validTarget(target)) { api.notify('Elegí un cliente y una red social válidos.', true); return false; }
      const item = newItem({title, caption:$('bono-idea-text').value, type:$('bono-idea-type').value, date:null, target});
      if (!api.TYPES[item.type] || !api.cleanItem(item)) { api.notify('No se pudo validar el contenido.', true); return false; }
      if (!api.commit(() => { state().items = [...state().items, item]; })) return false;
      api.notify(`Idea guardada en el Banco de ideas de ${clientOf(target.clientId).name}.`);
      return true;
    }, 'Guardar en el Banco de ideas');
    widen();
    const warn = () => {
      const target = readTarget('bono-idea'), title = $('bono-idea-title').value;
      const repeated = title.trim() && state().items.some(x => !x.date && x.clientId === target.clientId && sameText(x.title, title));
      const el = $('bono-idea-warning'); el.hidden = !repeated;
      el.textContent = repeated ? `Ya hay una idea con este título en el Banco de ideas de ${clientOf(target.clientId)?.name || 'este cliente'}. Si la guardás, se agregará otra.` : '';
    };
    bindTarget('bono-idea', warn);
    $('bono-idea-title').addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); warn(); });
  }
  function nextWeekday(offset) {
    const d = api.parseDate(api.today()); const diff = (offset - ((d.getDay() + 6) % 7) + 7) % 7;
    d.setDate(d.getDate() + diff); return api.dateKey(d);
  }
  function findPost(id) { for (const c of CALS) { const p = postsOf(c).find(x => x.id === id); if (p) return [c, p]; } return []; }
  function addPost(id) {
    const [cal, p] = findPost(id); if (!p) return;
    api.manager('Agregar a mi planificación', `<p class="bono-dialog-lead"><span class="bono-day-badge">${esc(p.day)}</span> Publicación ${p.number} · ${esc(cal.sector)}</p>${targetFields('bono-post', defaultClient())}<div class="bono-form-row"><div class="field"><label for="bono-post-date">Fecha de publicación *</label><input id="bono-post-date" type="date" required value="${nextWeekday(p.dayOffset)}" max="9999-12-31"><p class="field-help">Sugerida: el próximo ${esc(p.day.toLocaleLowerCase('es'))}.</p></div><div class="field"><label for="bono-post-type">Tipo de contenido</label><select id="bono-post-type">${typeOptions(typeFor(p.format))}</select></div></div><div class="field"><label for="bono-post-title">Título o tema *</label><input id="bono-post-title" maxlength="120" required autocomplete="off" value="${esc(postTitle(p))}"></div><div class="field"><label for="bono-post-text">Revisá el contenido</label><textarea id="bono-post-text" class="bono-preview-text" maxlength="20000">${esc(postCaption(cal, p))}</textarea></div><p class="bono-warning" id="bono-post-warning" role="alert" hidden></p><p class="field-help">Se creará con estado «${esc(api.STATUS.idea)}» para que la prepares. No se modifica ninguna publicación existente.</p>`, () => {
      const title = $('bono-post-title').value.trim(), date = $('bono-post-date').value, warning = $('bono-post-warning');
      if (!title) { $('bono-post-title').setAttribute('aria-invalid', 'true'); $('bono-post-title').focus(); api.notify('Escribí un título para la publicación.', true); return false; }
      if (!api.validDate(date)) { $('bono-post-date').setAttribute('aria-invalid', 'true'); $('bono-post-date').focus(); api.notify('Elegí una fecha válida.', true); return false; }
      const target = readTarget('bono-post');
      if (!validTarget(target)) { api.notify('Elegí un cliente y una red social válidos.', true); return false; }
      if (exists(target.clientId, date, title, target)) { warning.hidden = false; warning.textContent = `Ya existe «${title}» para ${targetName(target)} el ${longDate(date)}. Elegí otra fecha o red social para evitar un duplicado.`; $('bono-post-date').focus(); return false; }
      const item = newItem({title, caption:$('bono-post-text').value, type:$('bono-post-type').value, date, target});
      if (!api.TYPES[item.type] || !api.cleanItem(item)) { api.notify('No se pudo validar el contenido.', true); return false; }
      if (!api.commit(() => { state().items = [...state().items, item]; })) return false;
      api.notify(`Publicación agregada al calendario: ${longDate(date)}.`);
      return true;
    }, 'Agregar al calendario');
    widen();
    const clear = () => { const w = $('bono-post-warning'); w.hidden = true; w.textContent = ''; };
    bindTarget('bono-post', clear);
    ['bono-post-date','bono-post-title'].forEach(fid => $(fid).addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); clear(); }));
  }

  // ---------- Use a full calendar ----------
  // Week 1 starts on the first Monday of the month. Original weekdays are kept; a date that
  // would fall outside the month moves to the nearest free weekday inside it and is flagged.
  function suggestDates(cal, year, month) {
    const len = new Date(year, month + 1, 0).getDate(), firstDay = new Date(year, month, 1, 12).getDay();
    const firstMonday = 1 + (8 - firstDay) % 7;
    const posts = postsOf(cal), ideal = posts.map(p => firstMonday + (p.week - 1) * 7 + p.dayOffset);
    const used = new Set(ideal.filter(d => d >= 1 && d <= len));
    const weekday = d => { const w = new Date(year, month, d, 12).getDay(); return w > 0 && w < 6; };
    const key = d => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return posts.map((p, n) => {
      let day = ideal[n], adjusted = false;
      if (day < 1 || day > len) {
        adjusted = true;
        const target = Math.min(len, Math.max(1, day));
        const candidates = Array.from({length:len}, (_, k) => k + 1).filter(d => !used.has(d) && weekday(d)).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a);
        day = candidates[0] || target; used.add(day);
      }
      return {post:p, date:key(day), suggested:key(day), adjusted, checked:true};
    });
  }
  function openWizard(calId) {
    const cal = CALS.find(c => c.id === calId); if (!cal) return;
    const dialog = $('manager-dialog'), previous = document.activeElement, previousSelector = api.focusTarget(previous);
    const now = api.parseDate(api.today()), nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
    const w = {step:1, clientId:defaultClient(), year:nextMonth.getFullYear(), month:nextMonth.getMonth(), accounts:null, none:false, platform:'instagram', rows:null, rowsKey:'', error:'', busy:false, result:null};
    const STEP_NAMES = ['Elegir cliente','Elegir mes','Seleccionar redes sociales','Revisar publicaciones','Confirmar'];
    const targets = () => [...accountsOf(w.clientId).filter(a => w.accounts.has(a.id)).map(a => ({clientId:w.clientId, accountId:a.id, platform:a.platform})), ...(w.none ? [{clientId:w.clientId, accountId:null, platform:w.platform}] : [])];
    const resetTargets = () => { const list = accountsOf(w.clientId); w.accounts = new Set(list.slice(0, 1).map(a => a.id)); w.none = !list.length; };
    resetTargets();
    const monthLabel = () => `${MONTHS[w.month]} de ${w.year}`;
    const monthItems = () => state().items.filter(x => x.clientId === w.clientId && x.date && x.date.startsWith(`${w.year}-${String(w.month + 1).padStart(2, '0')}`)).length;
    const rowDup = row => targets().filter(t => exists(w.clientId, row.date, postTitle(row.post), t));
    const plan = () => w.rows.filter(r => r.checked).flatMap(r => targets().filter(t => !exists(w.clientId, r.date, postTitle(r.post), t)).map(t => ({row:r, target:t})));
    function ensureRows() {
      const key = [w.clientId, w.year, w.month].join('|');
      if (w.rows && w.rowsKey === key) return;
      w.rows = suggestDates(cal, w.year, w.month); w.rowsKey = key;
    }
    function body() {
      if (w.step === 1) {
        return `<fieldset class="bono-choices"><legend>¿Para qué cliente querés usar este calendario?</legend>${state().clients.map(c => { const n = accountsOf(c.id).length; return `<label class="bono-choice"><input type="radio" name="bono-wz-client" value="${esc(c.id)}" ${c.id === w.clientId ? 'checked' : ''}><span class="bono-dot" style="background:${esc(c.color)}" aria-hidden="true"></span><span><strong>${esc(c.name)}</strong><small>${n} ${n === 1 ? 'cuenta social' : 'cuentas sociales'}</small></span></label>`; }).join('')}</fieldset><p class="field-help">Solo podés elegir clientes existentes. Para agregar uno nuevo, usá Clientes y cuentas.</p>`;
      }
      if (w.step === 2) {
        const thisYear = now.getFullYear(), years = Array.from({length:5}, (_, k) => thisYear - 1 + k);
        if (!years.includes(w.year)) years.push(w.year);
        const n = monthItems();
        return `<p>Elegí el mes en el que vas a publicar. Las fechas se adaptan a los días reales de ese mes.</p><div class="bono-form-row"><div class="field"><label for="bono-wz-month">Mes</label><select id="bono-wz-month">${MONTHS.map((m, k) => `<option value="${k}" ${k === w.month ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="field"><label for="bono-wz-year">Año</label><select id="bono-wz-year">${years.sort().map(y => `<option value="${y}" ${y === w.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div><p class="bono-info" id="bono-wz-month-info">${n ? `${esc(clientOf(w.clientId).name)} ya tiene ${n} ${n === 1 ? 'publicación' : 'publicaciones'} en ${monthLabel()}. Se conservan sin cambios: las nuevas se suman a las existentes.` : `${esc(clientOf(w.clientId).name)} todavía no tiene publicaciones en ${monthLabel()}.`}</p>`;
      }
      if (w.step === 3) {
        const list = accountsOf(w.clientId);
        return `<fieldset class="bono-choices"><legend>¿En qué redes vas a publicar?</legend>${list.length ? list.map(a => `<label class="bono-choice"><input type="checkbox" name="bono-wz-account" value="${esc(a.id)}" ${w.accounts.has(a.id) ? 'checked' : ''}><span class="bono-choice-icon">${api.platformIcon(a.platform)}</span><span><strong>${esc(api.PLATFORM[a.platform])}</strong><small>${esc(a.username)}${a.name ? ' · ' + esc(a.name) : ''}</small></span></label>`).join('') : `<p class="bono-info">${esc(clientOf(w.clientId).name)} no tiene cuentas sociales registradas. Podés elegir una red social sin cuenta específica o agregar cuentas desde Clientes y cuentas.</p>`}<label class="bono-choice"><input type="checkbox" id="bono-wz-none" ${w.none ? 'checked' : ''}><span class="bono-choice-icon">${api.platformIcon(w.platform)}</span><span><strong>Sin cuenta específica</strong><small>Elegí la red social de referencia</small></span></label><div class="field bono-none-platform" ${w.none ? '' : 'hidden'}><label for="bono-wz-platform">Red social</label><select id="bono-wz-platform">${platformOptions(w.platform)}</select></div></fieldset><p class="field-help">Cada publicación guarda una sola red social. Si elegís varias, se crea una copia de cada publicación por red. No se crean cuentas nuevas.</p><p class="bono-warning" id="bono-wz-error" role="alert" ${w.error ? '' : 'hidden'}>${esc(w.error)}</p>`;
      }
      if (w.step === 4) {
        ensureRows();
        const selected = w.rows.filter(r => r.checked).length;
        return `<p>Fechas sugeridas para ${monthLabel()}: la semana 1 empieza el primer lunes del mes y se mantienen los días originales (lunes, miércoles y viernes). Podés cambiar cualquier fecha o desmarcar publicaciones.</p><div class="bono-review-tools"><p id="bono-wz-selected" aria-live="polite">${selected} de ${w.rows.length} publicaciones seleccionadas</p><div><button type="button" class="text-btn" data-wz="all">Marcar todas</button><button type="button" class="text-btn" data-wz="none">Desmarcar todas</button></div></div>${cal.weeks.map(week => `<section class="bono-review-week" aria-labelledby="bono-wz-week-${week.number}"><h3 id="bono-wz-week-${week.number}">Semana ${week.number} · ${esc(week.theme)}</h3>${w.rows.map((r, n) => [r, n]).filter(([r]) => r.post.week === week.number).map(([r, n]) => rowHTML(r, n)).join('')}</section>`).join('')}<p class="bono-warning" id="bono-wz-error" role="alert" ${w.error ? '' : 'hidden'}>${esc(w.error)}</p>`;
      }
      if (w.step === 5) {
        const p = plan(), selected = w.rows.filter(r => r.checked), skipped = selected.length * targets().length - p.length, dates = p.map(x => x.row.date).sort();
        return `<dl class="bono-summary"><div><dt>Cliente</dt><dd>${esc(clientOf(w.clientId)?.name || '')}</dd></div><div><dt>Mes</dt><dd>${monthLabel()}</dd></div><div><dt>Redes sociales</dt><dd>${targets().map(t => esc(targetName(t))).join('<br>')}</dd></div><div><dt>Publicaciones elegidas</dt><dd>${selected.length} de ${w.rows.length}</dd></div><div><dt>Se crearán</dt><dd><strong>${p.length} ${p.length === 1 ? 'publicación' : 'publicaciones'}</strong>${dates.length ? ` entre el ${esc(shortDate(dates[0]))} y el ${esc(shortDate(dates[dates.length - 1]))}` : ''}</dd></div><div><dt>Estado inicial</dt><dd>${esc(api.STATUS.idea)} (pendiente de preparación)</dd></div></dl>${skipped ? `<p class="bono-warning">${skipped} ${skipped === 1 ? 'combinación ya existe' : 'combinaciones ya existen'} con el mismo título, fecha y red social, y no se ${skipped === 1 ? 'volverá' : 'volverán'} a crear.</p>` : ''}<p class="bono-safe">${api.icon('shield')}<span>No se modifica ni se elimina ningún contenido existente. Si algo falla al guardar, no se incorpora ninguna publicación.</span></p><p class="bono-warning" id="bono-wz-error" role="alert" ${w.error ? '' : 'hidden'}>${esc(w.error)}</p>`;
      }
      const r = w.result;
      return `<div class="bono-done"><span class="bono-done-icon">${api.icon('check')}</span><h3>¡Calendario incorporado!</h3><p>Se ${r.count === 1 ? 'agregó 1 publicación' : `agregaron ${r.count} publicaciones`} a ${esc(r.client)} en ${esc(r.month)}, con estado «${esc(api.STATUS.idea)}».${r.skipped ? ` ${r.skipped} ya ${r.skipped === 1 ? 'existía' : 'existían'} y no se ${r.skipped === 1 ? 'duplicó' : 'duplicaron'}.` : ''}</p><p class="field-help">Podés editarlas, moverlas y seguir su avance desde el calendario y Seguimiento.</p></div>`;
    }
    function rowHTML(r, n) {
      const dups = rowDup(r), all = dups.length && dups.length === targets().length;
      return `<div class="bono-review-row ${r.checked && !all ? '' : 'is-off'}" data-row="${n}"><label class="bono-review-check"><input type="checkbox" data-wz-row="${n}" ${r.checked ? 'checked' : ''} aria-describedby="bono-wz-note-${n}"><span class="bono-check" aria-hidden="true">${api.icon('check')}</span><span class="bono-review-text"><small>Publicación ${r.post.number} · ${esc(r.post.day)}</small><strong>${esc(postTitle(r.post))}</strong><span>${esc(noDot(r.post.category))} · ${esc(capital(noDot(r.post.format)))}</span></span></label><div class="field bono-review-date"><label for="bono-wz-date-${n}">Fecha</label><input type="date" id="bono-wz-date-${n}" data-wz-date="${n}" value="${r.date}" max="9999-12-31"></div><p class="bono-review-note" id="bono-wz-note-${n}">${noteText(r, dups)}</p></div>`;
    }
    function noteText(r, dups = rowDup(r)) {
      const parts = [];
      if (!api.validDate(r.date)) parts.push('<span class="is-error">Elegí una fecha válida.</span>');
      else if (r.adjusted && r.date === r.suggested) parts.push('Fecha ajustada para que quede dentro del mes.');
      if (dups.length) parts.push(`<span class="is-dup">Ya existe para ${dups.map(t => esc(targetName(t))).join(', ')} en esa fecha: no se duplicará.</span>`);
      return parts.join(' ');
    }
    function collect() {
      if (w.step === 1) { const c = dialog.querySelector('input[name="bono-wz-client"]:checked')?.value; if (c && c !== w.clientId) { w.clientId = c; resetTargets(); } }
      if (w.step === 2) { w.month = Number($('bono-wz-month').value); w.year = Number($('bono-wz-year').value); }
      if (w.step === 3) { w.accounts = new Set([...dialog.querySelectorAll('input[name="bono-wz-account"]:checked')].map(x => x.value)); w.none = $('bono-wz-none').checked; w.platform = $('bono-wz-platform').value; }
    }
    function validate() {
      if (w.step === 1 && !clientOf(w.clientId)) return 'Elegí un cliente.';
      if (w.step === 3 && !targets().length) return 'Elegí al menos una red social.';
      if (w.step === 4) {
        if (!w.rows.some(r => r.checked)) return 'Seleccioná al menos una publicación.';
        if (w.rows.some(r => r.checked && !api.validDate(r.date))) return 'Revisá las fechas: hay publicaciones seleccionadas sin una fecha válida.';
        if (!plan().length) return 'Las publicaciones seleccionadas ya existen en tu planificación. No hay nada nuevo para incorporar.';
      }
      return '';
    }
    function draw(focusSel) {
      const done = w.step === 6;
      const count = done ? 0 : w.step === 5 ? plan().length : 0;
      dialog.innerHTML = `<form id="bono-wizard" novalidate><div class="modal-header"><div><p class="bono-step-label">${done ? 'Listo' : `Paso ${w.step} de 5 · ${STEP_NAMES[w.step - 1]}`}</p><h2 id="manager-title">Usar este calendario</h2><p class="bono-wz-sub">${esc(cal.sector)} — ${esc(cal.business)}</p></div><button type="button" class="icon-btn" data-wz="close" aria-label="Cerrar ventana">${api.icon('close')}</button></div>${done ? '' : `<ol class="bono-steps" aria-hidden="true">${STEP_NAMES.map((s, k) => `<li class="${k + 1 < w.step ? 'is-done' : k + 1 === w.step ? 'is-current' : ''}"><span>${k + 1}</span></li>`).join('')}</ol>`}<div class="modal-body">${body()}</div><div class="modal-footer">${done ? `<button type="button" class="btn btn-outline" data-wz="close">Cerrar</button><button type="button" class="btn btn-primary" data-wz="calendar">${api.icon('calendar')} Ver en el calendario</button>` : `${w.step === 1 ? '<button type="button" class="btn btn-outline" data-wz="close">Cancelar</button>' : '<button type="button" class="btn btn-outline" data-wz="back">Atrás</button>'}<button type="submit" class="btn btn-primary" id="bono-wz-next">${w.step === 5 ? `Incorporar ${count} ${count === 1 ? 'publicación' : 'publicaciones'}` : 'Siguiente'}</button>`}</div></form>`;
      const form = $('bono-wizard'); form.onsubmit = onSubmit; form.onclick = onClick; form.onchange = onChange;
      window.PlanificaSelects?.enhance(dialog);
      const target = (focusSel && dialog.querySelector(focusSel)) || $('manager-title');
      if (target === $('manager-title')) target.tabIndex = -1;
      target.focus({preventScroll:true});
      dialog.querySelector('.modal-body').scrollTop = 0;
    }
    function go(step) { collect(); if (step > w.step) { const error = validate(); if (error) { w.error = error; draw('#bono-wz-error'); return; } } w.error = ''; w.step = step; draw(); }
    function confirmImport() {
      if (w.busy) return; w.busy = true;
      const button = $('bono-wz-next'); if (button) button.disabled = true;
      const fail = message => { w.error = message; w.busy = false; draw('#bono-wz-error'); };
      const client = clientOf(w.clientId), list = targets();
      if (!client) return fail('El cliente ya no existe. No se incorporó ninguna publicación.');
      if (!list.length || !list.every(validTarget)) return fail('Alguna red social elegida ya no está disponible. Revisá el paso 3. No se incorporó ninguna publicación.');
      const selected = w.rows.filter(r => r.checked);
      if (!selected.length || selected.some(r => !api.validDate(r.date))) return fail('Revisá las fechas seleccionadas. No se incorporó ninguna publicación.');
      const p = plan();
      if (!p.length) return fail('Las publicaciones seleccionadas ya existen. No hay nada nuevo para incorporar.');
      const items = p.map(({row, target}) => newItem({title:postTitle(row.post), caption:postCaption(cal, row.post), type:typeFor(row.post.format), date:row.date, target}));
      if (items.some(item => !api.cleanItem({...item}))) return fail('No se pudo validar el contenido. No se incorporó ninguna publicación.');
      // One atomic commit: either every selected publication is saved or none is.
      if (!api.commit(() => { state().items = [...state().items, ...items]; })) return fail('No se pudo guardar en este navegador. No se incorporó ninguna publicación y tus datos anteriores siguen intactos.');
      w.result = {count:items.length, skipped:selected.length * list.length - items.length, client:client.name, month:monthLabel(), first:items.map(x => x.date).sort()[0]};
      w.busy = false; w.step = 6; draw();
    }
    function onSubmit(e) { e.preventDefault(); if (w.step === 5) { collect(); confirmImport(); } else if (w.step < 5) go(w.step + 1); }
    const shut = () => { dialog.classList.remove('bono-dialog', 'bono-wizard'); dialog.close(); };
    function onClick(e) {
      const btn = e.target.closest('[data-wz]'); if (!btn) return;
      const a = btn.dataset.wz;
      if (a === 'close') shut();
      if (a === 'back') go(w.step - 1);
      if (a === 'all' || a === 'none') { w.rows.forEach(r => { r.checked = a === 'all'; }); w.error = ''; draw(`[data-wz="${a}"]`); }
      if (a === 'calendar') {
        const first = w.result?.first; shut();
        if (first) { state().focusDate = first; state().selectedDate = first; }
        api.navigate('calendar');
        const s = state(); if ((s.clientFilter !== 'all' && s.clientFilter !== w.clientId) || s.platformFilter !== 'all') api.notify('Tenés filtros activos en el calendario: limpialos para ver todas las publicaciones nuevas.');
      }
    };
    function onChange(e) {
      const t = e.target;
      if (t.name === 'bono-wz-client') { collect(); }
      if (t.id === 'bono-wz-month' || t.id === 'bono-wz-year') { collect(); const info = $('bono-wz-month-info'); if (info) { const n = monthItems(); info.textContent = n ? `${clientOf(w.clientId).name} ya tiene ${n} ${n === 1 ? 'publicación' : 'publicaciones'} en ${monthLabel()}. Se conservan sin cambios: las nuevas se suman a las existentes.` : `${clientOf(w.clientId).name} todavía no tiene publicaciones en ${monthLabel()}.`; } }
      if (t.id === 'bono-wz-none') dialog.querySelector('.bono-none-platform').hidden = !t.checked;
      if (t.id === 'bono-wz-platform') { w.platform = t.value; const iconEl = $('bono-wz-none').closest('label').querySelector('.bono-choice-icon'); iconEl.innerHTML = api.platformIcon(t.value); }
      if (t.dataset.wzRow !== undefined || t.dataset.wzDate !== undefined) {
        const n = Number(t.dataset.wzRow ?? t.dataset.wzDate), r = w.rows[n];
        if (t.dataset.wzRow !== undefined) r.checked = t.checked; else { r.date = t.value; t.toggleAttribute('aria-invalid', !api.validDate(t.value)); }
        const dups = rowDup(r), all = dups.length && dups.length === targets().length;
        $('bono-wz-note-' + n).innerHTML = noteText(r, dups);
        dialog.querySelector(`[data-row="${n}"]`).classList.toggle('is-off', !r.checked || !!all);
        $('bono-wz-selected').textContent = `${w.rows.filter(x => x.checked).length} de ${w.rows.length} publicaciones seleccionadas`;
      }
    };
    dialog.onclose = () => { if (dialog.open) return; dialog.classList.remove('bono-dialog', 'bono-wizard'); document.body.style.overflow = ''; api.restoreFocus(previous, previousSelector); };
    dialog.classList.add('bono-dialog', 'bono-wizard');
    draw();
    dialog.showModal(); document.body.style.overflow = 'hidden';
    $('manager-title').focus({preventScroll:true});
  }

  // ---------- Navigation & events ----------
  function show(next) {
    view.screen = next; api.render();
    window.scrollTo({top:0, behavior:'auto'});
    const h = document.querySelector('#page-header h1'); if (h) { h.tabIndex = -1; h.focus({preventScroll:true}); }
  }
  function jump(id) {
    const el = $(id); if (!el) return;
    el.scrollIntoView({behavior:reduced() ? 'auto' : 'smooth', block:'start'});
    const h = el.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({preventScroll:true}); }
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-bono]'); if (!el || !api) return;
    const a = el.dataset.bono, id = el.dataset.id;
    if (a === 'go' && ['home','ideas','guide','checklist','calendars'].includes(el.dataset.screen)) show(el.dataset.screen);
    else if (a === 'idea' && IDEAS.some(x => x.id === id)) { view.ideaId = id; show('idea'); }
    else if (a === 'tip' && TIPS.some(x => x.id === id)) { view.tipId = id; show('tip'); }
    else if (a === 'calendar' && CALS.some(x => x.id === id)) { view.calendarId = id; show('calendar'); }
    else if (a === 'filter') applyFilter(el.dataset.filter);
    else if (a === 'jump') jump(el.dataset.target);
    else if (a === 'add-idea') addIdea(id);
    else if (a === 'add-post') addPost(id);
    else if (a === 'use-calendar') openWizard(id);
    else if (a === 'checklist-reset') resetChecklist();
  });
  document.addEventListener('change', e => { if (api && e.target.matches?.('[data-bono-task]')) toggleTask(e.target); });

  function render(container) {
    const s = screen();
    container.innerHTML = `<div class="bono-root" data-screen="${s}">${({home, ideas:ideasScreen, idea:ideaScreen, guide:guideScreen, tip:tipScreen, checklist:checklistScreen, calendars:calendarsScreen, calendar:calendarScreen})[s]()}</div>`;
  }
  window.PlanificaBonos = {
    init(options) { api = options; },
    render, header,
    reset() { view.screen = 'home'; },
    counts: {ideas:IDEAS.length, tips:TIPS.length, tasks:TASK_TOTAL, posts:CALS.reduce((n, c) => n + postsOf(c).length, 0)},
    _suggestDates: suggestDates
  };
})();
