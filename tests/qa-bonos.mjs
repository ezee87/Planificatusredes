// Browser checks for Mis bonos. Isolated Chrome profile, local server with the real CSP.
// It never contacts external services. Screenshots go to tests/visual-bonos.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'planifica-bonos-'));
const shots=join(root,'tests','visual-bonos');await mkdir(shots,{recursive:true});
const csp=(await readFile(join(root,'_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const FILES=['index.html','commercial.js','commercial.css','custom-selects.js','custom-selects.css','bonos-data.js','bonos.js','bonos.css','favicon.svg','fonts/inter-latin-wght.woff2'];
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname,file=pathname==='/'?'index.html':pathname.slice(1);
  if(!FILES.includes(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8','Content-Security-Policy':csp});res.end(await readFile(join(root,file)));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url=`http://127.0.0.1:${server.address().port}/`;
const proc=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[`--user-data-dir=${profile}`,'--headless=new','--no-first-run','--disable-default-apps','--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let port;
for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];break;}catch{await wait(50);}}
if(!port)throw Error('Chrome did not start');
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
await new Promise(ok=>ws.onopen=ok);let seq=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,400));if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails).slice(0,600));return r.result.value;};
const js=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
let failures=0;
const check=(name,ok,detail='')=>{if(ok)console.log('OK   '+name);else{failures++;console.log('FAIL '+name+(detail?' → '+detail:''));}};
const click=async selector=>{const ok=await js(s=>{const e=document.querySelector(s);if(!e)return false;e.scrollIntoView({block:'center',behavior:'instant'});e.click();return true;},selector);if(!ok)throw Error('Missing '+selector);await wait(60);};
const ready=async()=>{for(let i=0;i<150;i++){if(await evaluate("document.readyState==='complete'&&!!window.PlanificaBonos&&!!document.querySelector('#desktop-nav button')").catch(()=>false))return;await wait(40);}throw Error('App not ready');};
const width=async w=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:w<800?820:900,deviceScaleFactor:1,mobile:w<800});await wait(120);};
const shot=async name=>{await wait(120);const x=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(shots,name+'.png'),Buffer.from(x.data,'base64'));};
const NOW=new Date().toISOString();
const CLIENTS=[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'c1',name:'Café Aroma',description:'Cafetería de barrio',color:'#a79bb6'},{id:'c2',name:'Estudio Línea',description:'',color:'#8ca8b8'}];
const ACCOUNTS=[{id:'a1',clientId:'c1',platform:'instagram',username:'@cafearoma'},{id:'a2',clientId:'c1',platform:'facebook',username:'Café Aroma',name:'Página'},{id:'a3',clientId:'c2',platform:'linkedin',username:'estudio-linea'}];
const EXISTING=[
  {id:'e1',title:'Un café para empezar el día',caption:'Texto original del usuario',platform:'instagram',type:'reel',status:'ready',date:'2027-02-01',clientId:'c1',accountId:'a1',createdAt:NOW,updatedAt:NOW},
  {id:'e2',title:'Promo de febrero',caption:'No tocar',platform:'facebook',type:'post',status:'preparation',date:'2027-02-10',clientId:'c1',accountId:'a2',createdAt:NOW,updatedAt:NOW},
  {id:'e3',title:'Idea previa',caption:'',platform:'instagram',type:'post',status:'idea',date:null,clientId:'c1',accountId:'a1',createdAt:NOW,updatedAt:NOW}
];
const seed=(opts={})=>js((data,opts)=>{localStorage.clear();localStorage.setItem('planifica-tus-redes-activated-v1','active');if(opts.tutorial!==false)localStorage.setItem('planifica-tus-redes-tutorial-v1','done');if(opts.data!==false)localStorage.setItem('planifica-tus-redes-v2',JSON.stringify(data));},{app:'Planifica tus Redes',version:2,items:EXISTING,clients:CLIENTS,accounts:ACCOUNTS,preferences:{clientFilter:'all',platformFilter:'all',mode:'month'}},opts);
const stored=()=>js(()=>JSON.parse(localStorage.getItem('planifica-tus-redes-v2')));
const reload=async()=>{await send('Page.reload',{ignoreCache:true});await wait(150);await ready();};
const setValue=(selector,value)=>js((s,v)=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e.value;},selector,value);

await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
await send('Page.navigate',{url});await wait(300);await ready();
await width(1440);

// ---------- Source texts for completeness checks ----------
const md=async name=>(await readFile(join(root,'Bonos',name),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
const [B1,B2,B3]=await Promise.all(['bono-1-ideas-de-contenido.md','bono-2-guia-de-organizacion.md','bono-3-calendarios-de-ejemplo.md'].map(md));
const STRUCTURAL_LABELS=new Set(['tema','categoría']);
// Each source line is split into fragments (bold labels, " — " headings). Every fragment must
// appear in the rendered text; only the labels "Tema" and "Categoría" are shown as layout.
const fragments=line=>{
  const raw=line.trim();if(!raw||/^-{2,}$/.test(raw)||/^\**Categoría \d+/.test(raw))return [];
  return raw.replace(/^#+\s*(\d{2})\.\s+/,'$1 — ').replace(/^#+\s*/,'').replace(/^[-☐]\s+/,'').split(/\*\*| — /).map(s=>s.replace(/^\*|\*$/g,'').trim().replace(/[:.]$/,'').trim()).filter(Boolean).filter(s=>!STRUCTURAL_LABELS.has(s.toLocaleLowerCase('es')));
};
const norm=s=>s.toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
const missingIn=(text,lines)=>{const t=norm(text);return lines.flatMap(fragments).filter(f=>!t.includes(norm(f)));};
const screenText=()=>js(()=>{const r=document.querySelector('#page-header').innerText+'\n'+document.querySelector('#page-content').innerText;const labels=[...document.querySelectorAll('#page-content [aria-label]')].map(e=>e.getAttribute('aria-label')).join('\n');return r+'\n'+labels;});
const go=async(action,attrs)=>{await js((a,attrs)=>{const b=document.createElement('button');b.dataset.bono=a;Object.assign(b.dataset,attrs);document.querySelector('#page-content').append(b);b.click();b.remove();},action,attrs);await wait(40);};

// ---------- Existing user: direct access, no onboarding ----------
await seed();await reload();
check('Usuario existente: sin onboarding',await evaluate("document.getElementById('entry-screen').hidden"));
check('Navegación de escritorio incluye Mis bonos con ícono',await evaluate("(()=>{const b=document.querySelector('#desktop-nav [data-page=bonos]');return !!b&&b.textContent.includes('Mis bonos')&&!!b.querySelector('svg rect')})()"));
check('Navegación móvil incluye Mis bonos',await evaluate("!!document.querySelector('#mobile-nav [data-page=bonos]')"));
await click('#desktop-nav [data-page=bonos]');
check('Pantalla principal: título y descripción',await evaluate("document.querySelector('#page-header h1').textContent==='Tus herramientas extra para planificar mejor'&&document.querySelector('#page-header .lead').textContent.startsWith('Tres recursos prácticos')"));
check('Pantalla principal: tres tarjetas y acciones',await evaluate("JSON.stringify([...document.querySelectorAll('.bono-card .btn')].map(b=>b.textContent.trim()))===JSON.stringify(['Explorar ideas','Ver guía','Explorar calendarios'])"));
check('Métricas ocultas en Mis bonos',await evaluate("document.getElementById('metrics').hidden"));
await shot('home-1440');

// ---------- Bono 1 ----------
await click('#bono-open-ideas');
check('Bono 1: 30 tarjetas de ideas',await evaluate("document.querySelectorAll('.bono-idea-card').length===30"));
for(const [id,label] of [['educativo','Educativo'],['interaccion','Interacción'],['autoridad','Autoridad'],['promocional','Promocional'],['confianza','Confianza y comunidad']]){
  await click(`[data-bono=filter][data-filter=${id}]`);
  const r=await js(id=>({visible:[...document.querySelectorAll('.bono-idea-card')].filter(c=>!c.hidden).map(c=>c.dataset.category),pressed:document.querySelector(`[data-filter=${id}]`).getAttribute('aria-pressed')}),id);
  check(`Filtro ${label}: 6 ideas sin recargar`,r.visible.length===6&&r.visible.every(c=>c===id)&&r.pressed==='true');
}
await click('[data-bono=filter][data-filter=all]');
check('Filtro Todas: 30 ideas',await evaluate("[...document.querySelectorAll('.bono-idea-card')].filter(c=>!c.hidden).length===30"));
check('Tarjetas con formato y duración cuando corresponde',await evaluate("[...document.querySelectorAll('.bono-idea-card')].every(c=>c.querySelector('dt').textContent==='Formato')&&document.querySelectorAll('.bono-idea-card dl div').length>30"));
const ideaChunks=B1.split(/\n(?=## \d{2}\. )/);
check('Fuente Bono 1 con 30 ideas',ideaChunks.length===30);
let ideaMissing=[];
for(let n=0;n<30;n++){
  await go('idea',{id:'idea-'+String(n+1).padStart(2,'0')});
  if(n===0){check('Detalle con 5 apartados',await evaluate("JSON.stringify([...document.querySelectorAll('.bono-section > h2')].map(h=>h.textContent.replace(/^\\d/,'')))===JSON.stringify(['Objetivo y formato recomendado','Modelo narrativo','Plantilla adaptable','Ejemplo práctico','Cómo adaptarla a otros clientes'])"));await shot('idea-1440');}
  const miss=missingIn(await screenText(),ideaChunks[n].split('\n'));if(miss.length)ideaMissing.push(`idea ${n+1}: ${miss.slice(0,3).join(' | ')}`);
}
check('Las 30 ideas están completas',!ideaMissing.length,ideaMissing.slice(0,5).join(' || '));

// Save idea to the existing Banco de ideas
await go('idea',{id:'idea-01'});
const before1=await stored();
await click('#bono-add-idea');
check('Diálogo de idea abierto con vista previa',await evaluate("document.getElementById('manager-dialog').open&&document.getElementById('bono-idea-text').value.includes('OBJETIVO')"));
const caption=await evaluate("document.getElementById('bono-idea-text').value");
check('Vista previa incluye objetivo, formato, estructura e indicaciones',['OBJETIVO','FORMATO SUGERIDO','ESTRUCTURA NARRATIVA','INDICACIONES DE DESARROLLO','Gancho → Error','Gancho | 0–5 segundos'].every(s=>caption.includes(s)));
check('Vista previa no copia el ejemplo práctico',!caption.includes('centro de estética')&&!caption.includes('skincare'));
await setValue('#bono-idea-client','c2');
check('Cuentas filtradas por cliente',await evaluate("[...document.getElementById('bono-idea-account').options].map(o=>o.value).join()==='a3,'"));
await setValue('#bono-idea-title','Errores frecuentes en proyectos de arquitectura');
await click('#manager-dialog button[type=submit]');
const after1=await stored();
const newIdea=after1.items.find(x=>!before1.items.some(y=>y.id===x.id));
check('Idea guardada en el Banco de ideas existente',!!newIdea&&newIdea.date===null&&newIdea.status==='idea'&&newIdea.clientId==='c2'&&newIdea.accountId==='a3'&&newIdea.platform==='linkedin'&&newIdea.type==='reel'&&newIdea.title==='Errores frecuentes en proyectos de arquitectura');
check('Datos previos intactos al guardar idea',JSON.stringify(after1.items.filter(x=>before1.items.some(y=>y.id===x.id)))===JSON.stringify(before1.items)&&JSON.stringify(after1.clients)===JSON.stringify(before1.clients)&&JSON.stringify(after1.accounts)===JSON.stringify(before1.accounts));
await click('#desktop-nav [data-page=ideas]');
check('La idea aparece en Banco de ideas',await evaluate("[...document.querySelectorAll('.idea-grid .idea-card h3')].some(h=>h.textContent==='Errores frecuentes en proyectos de arquitectura')"));
await js(id=>document.querySelector(`.idea-grid [data-action=edit][data-id="${id}"]`).click(),newIdea.id);await wait(60);
check('La idea se edita con el modal existente',await evaluate("document.getElementById('modal-overlay').classList.contains('open')&&document.getElementById('item-title').value==='Errores frecuentes en proyectos de arquitectura'"));
await click('[data-action=close-modal]');

// ---------- Bono 2 ----------
await click('#desktop-nav [data-page=bonos]');await click('#bono-open-guide');
check('Guía: 4 etapas con 3, 3, 2 y 2 consejos',await evaluate("JSON.stringify([...document.querySelectorAll('.bono-stage')].map(s=>s.querySelectorAll('[data-bono=tip]').length))==='[3,3,2,2]'"));
check('Guía: acceso destacado a la checklist',await evaluate("!!document.querySelector('.bono-feature #bono-open-checklist')"));
let guideText=await screenText();await shot('guide-1440');
for(let n=1;n<=10;n++){await go('tip',{id:'tip-'+String(n).padStart(2,'0')});guideText+='\n'+await screenText();if(n===1){check('Consejo: cinco apartados y bloque destacado de la app',await evaluate("['Qué hacer','Por qué funciona','Cómo aplicarlo'].every(t=>[...document.querySelectorAll('.bono-block h2')].some(h=>h.textContent===t))&&document.querySelector('.bono-app-callout h2').textContent==='Aplicalo en Planifica tus redes'&&!!document.querySelector('.bono-habit')"));await shot('tip-1440');}}
await go('go',{screen:'checklist'});guideText+='\n'+await screenText();
const guideMissing=missingIn(guideText,B2.split('\n'));
check('Los 10 consejos, introducción, checklist y cierre están completos',!guideMissing.length,guideMissing.slice(0,5).join(' | '));
check('Checklist: 21 tareas en 5 días',await evaluate("document.querySelectorAll('[data-bono-task]').length===21&&document.querySelectorAll('.bono-day').length===5&&JSON.stringify([...document.querySelectorAll('.bono-day')].map(d=>d.querySelectorAll('[data-bono-task]').length))==='[4,4,4,4,5]'"));
const itemsBeforeCheck=JSON.stringify((await stored()).items);
for(const id of ['lunes-1','martes-2','viernes-5'])await click(`[data-bono-task="${id}"]`);
check('Progreso semanal 3/21',await evaluate("document.querySelector('#bono-check-count strong').textContent==='3'&&document.getElementById('bono-check-bar').getAttribute('aria-valuenow')==='3'"));
await click('[data-bono-task="martes-2"]');
check('Desmarcar tarea actualiza a 2/21',await evaluate("document.querySelector('#bono-check-count strong').textContent==='2'"));
check('Marcar tareas no modifica publicaciones',JSON.stringify((await stored()).items)===itemsBeforeCheck);
await shot('checklist-1440');
await reload();await click('#desktop-nav [data-page=bonos]');await click('#bono-open-guide');await click('#bono-open-checklist');
check('Checklist persiste tras recargar',await evaluate("document.querySelector('[data-bono-task=lunes-1]').checked&&document.querySelector('[data-bono-task=viernes-5]').checked&&document.querySelector('#bono-check-count strong').textContent==='2'"));
await click('#bono-check-reset');
check('Reiniciar pide confirmación',await evaluate("document.getElementById('manager-dialog').open&&document.getElementById('manager-title').textContent==='Reiniciar semana'"));
await click('#manager-dialog button[type=submit]');
check('Reinicio manual deja 0/21',await evaluate("document.querySelector('#bono-check-count strong').textContent==='0'&&![...document.querySelectorAll('[data-bono-task]')].some(x=>x.checked)"));
await click('[data-bono-task="jueves-1"]');
await js(()=>{const raw=JSON.parse(localStorage.getItem('planifica-tus-redes-checklist-v1'));const d=new Date(raw.week+'T12:00:00');d.setDate(d.getDate()-7);raw.week=d.toISOString().slice(0,10);localStorage.setItem('planifica-tus-redes-checklist-v1',JSON.stringify(raw));});
await reload();await click('#desktop-nav [data-page=bonos]');await click('#bono-open-guide');await click('#bono-open-checklist');
check('Nueva semana inicia checklist vacía',await evaluate("document.querySelector('#bono-check-count strong').textContent==='0'"));

// ---------- Bono 3 ----------
await click('#desktop-nav [data-page=bonos]');await click('#bono-open-calendars');
check('Tres calendarios con sector, negocio, 12 publicaciones y duración',await evaluate("(()=>{const c=[...document.querySelectorAll('.bono-cal-card')];return c.length===3&&c.every(x=>x.querySelector('.bono-sector')&&x.querySelector('h2')&&x.querySelector('.bono-cal-facts dd').textContent==='12'&&x.textContent.includes('Cuatro semanas'))})()"));
let calText=await screenText();await shot('calendars-1440');
for(const id of ['gastronomia','servicios','tiendas']){await go('calendar',{id});calText+='\n'+await screenText();}
check('36 publicaciones de ejemplo',await js(()=>window.PlanificaBonos.counts.posts)===36);
const calMissing=missingIn(calText,B3.split('\n'));
check('Las 36 publicaciones y textos del Bono 3 están completos',!calMissing.length,calMissing.slice(0,5).join(' | '));
check('Detalle agrupado en 4 semanas × 3 publicaciones',await evaluate("JSON.stringify([...document.querySelectorAll('.bono-week')].map(w=>w.querySelectorAll('.bono-post').length))==='[3,3,3,3]'&&document.querySelectorAll('.bono-post').length===12"));
// Date distribution: every month 2026–2031 keeps 12 unique weekday dates inside the month.
const dateCheck=await js(()=>{const bad=[];const cal=window.PlanificaBonosData.calendars.items[0];for(let y=2026;y<2032;y++)for(let m=0;m<12;m++){const rows=window.PlanificaBonos._suggestDates(cal,y,m);const prefix=`${y}-${String(m+1).padStart(2,'0')}`;const dates=rows.map(r=>r.date);const days=dates.map(d=>new Date(d+'T12:00:00').getDay());if(dates.length!==12||new Set(dates).size!==12||dates.some(d=>!d.startsWith(prefix))||days.some(w=>w===0||w===6)||rows.filter(r=>!r.adjusted).some(r=>(new Date(r.date+'T12:00:00').getDay()+6)%7!==r.post.dayOffset))bad.push(prefix);}return bad;});
check('Fechas válidas para 72 meses (incluye meses de 28 a 31 días)',!dateCheck.length,dateCheck.join(','));
await go('calendar',{id:'gastronomia'});await shot('calendar-1440');

// Individual post
const before2=await stored();
await click('#bono-add-gastronomia-02');
await setValue('#bono-post-client','c1');await setValue('#bono-post-account','a2');await setValue('#bono-post-date','2027-03-03');
check('Diálogo individual: revisión de contenido',await evaluate("document.getElementById('bono-post-text').value.includes('Desarrollo sugerido:')&&document.getElementById('bono-post-text').value.includes('CTA:')"));
await click('#manager-dialog button[type=submit]');
const after2=await stored();const newPost=after2.items.filter(x=>!before2.items.some(y=>y.id===x.id));
check('Publicación individual creada con el sistema existente',newPost.length===1&&newPost[0].date==='2027-03-03'&&newPost[0].accountId==='a2'&&newPost[0].platform==='facebook'&&newPost[0].status==='idea'&&newPost[0].type==='carrusel'&&newPost[0].clientId==='c1');
await click('#bono-add-gastronomia-02');
await setValue('#bono-post-client','c1');await setValue('#bono-post-account','a2');await setValue('#bono-post-date','2027-03-03');
await click('#manager-dialog button[type=submit]');
check('Duplicado individual bloqueado con aviso',(await stored()).items.length===after2.items.length&&await evaluate("document.getElementById('manager-dialog').open&&!document.getElementById('bono-post-warning').hidden"));
await js(()=>document.getElementById('manager-dialog').close());

// Full calendar
const before3=await stored();
await click('#bono-use-calendar');
check('Asistente paso 1',await evaluate("document.querySelector('.bono-step-label').textContent.startsWith('Paso 1 de 5')"));
await js(()=>{document.querySelector('input[name=bono-wz-client][value=c1]').click();});await click('#bono-wz-next');
check('Asistente paso 2 (mes)',await evaluate("document.querySelector('.bono-step-label').textContent.startsWith('Paso 2 de 5')"));
await setValue('#bono-wz-month','1');await setValue('#bono-wz-year','2027');
check('Aviso de publicaciones existentes en el mes',await evaluate("document.getElementById('bono-wz-month-info').textContent.includes('ya tiene 2 publicaciones')"));
await click('#bono-wz-next');
check('Paso 3 solo muestra redes del cliente',await evaluate("[...document.querySelectorAll('input[name=bono-wz-account]')].map(x=>x.value).join()==='a1,a2'"));
await js(()=>{const a2=document.querySelector('input[name=bono-wz-account][value=a2]');if(!a2.checked)a2.click();const a1=document.querySelector('input[name=bono-wz-account][value=a1]');if(!a1.checked)a1.click();});
await click('#bono-wz-next');
const review=await js(()=>[...document.querySelectorAll('[data-wz-date]')].map(x=>x.value));
check('Paso 4: 12 propuestas con fechas concretas de febrero 2027',review.length===12&&review.every(d=>d.startsWith('2027-02'))&&review[0]==='2027-02-01'&&review[11]==='2027-02-26',review.join(','));
check('Paso 4: aviso de duplicado existente',await evaluate("document.getElementById('bono-wz-note-0').textContent.includes('no se duplicará')"));
await shot('wizard-review-1440');
await js(()=>{document.querySelector('[data-wz-row="2"]').click();document.querySelector('[data-wz-row="5"]').click();});
await setValue('[data-wz-date="11"]','2027-02-27');
await click('#bono-wz-next');
check('Paso 5: resumen con 19 publicaciones (10 × 2 − 1 existente)',await evaluate("document.getElementById('bono-wz-next').textContent.includes('Incorporar 19')"));
await click('#bono-wz-next');
const after3=await stored();const imported=after3.items.filter(x=>!before3.items.some(y=>y.id===x.id));
check('Se incorporan solo las seleccionadas',imported.length===19&&!imported.some(x=>x.title.startsWith('Elegí tu bebida favorita'))&&imported.filter(x=>x.date==='2027-02-27').length===2);
check('Estado inicial pendiente de preparación',imported.every(x=>x.status==='idea'&&x.clientId==='c1'&&['a1','a2'].includes(x.accountId)));
check('No se sobrescriben ni modifican publicaciones existentes',JSON.stringify(after3.items.filter(x=>before3.items.some(y=>y.id===x.id)))===JSON.stringify(before3.items)&&after3.items.length===before3.items.length+19);
check('No se crean clientes ni cuentas',JSON.stringify(after3.clients)===JSON.stringify(before3.clients)&&JSON.stringify(after3.accounts)===JSON.stringify(before3.accounts));
check('Pantalla final del asistente',await evaluate("document.querySelector('.bono-done h3').textContent==='¡Calendario incorporado!'"));
await js(()=>document.querySelector('[data-wz=calendar]').click());await wait(80);
check('"Ver en el calendario" abre el calendario en el mes importado',await evaluate("document.querySelector('#desktop-nav [data-page=calendar]').classList.contains('active')&&document.querySelector('.range-label').textContent.includes('2027')"));
// Same import again → all duplicates for the selected rows, nothing new.
await click('#desktop-nav [data-page=bonos]');await click('#bono-open-calendars');await go('calendar',{id:'gastronomia'});
await click('#bono-use-calendar');await js(()=>document.querySelector('input[name=bono-wz-client][value=c1]').click());await click('#bono-wz-next');
await setValue('#bono-wz-month','1');await setValue('#bono-wz-year','2027');await click('#bono-wz-next');
await js(()=>{for(const v of ['a1','a2']){const x=document.querySelector(`input[name=bono-wz-account][value=${v}]`);if(!x.checked)x.click();}});await click('#bono-wz-next');
await js(()=>{document.querySelector('[data-wz-row="2"]').click();document.querySelector('[data-wz-row="5"]').click();});await setValue('[data-wz-date="11"]','2027-02-27');
await click('#bono-wz-next');
check('Reimportar lo mismo: bloqueado sin duplicar',await evaluate("document.querySelector('.bono-step-label').textContent.startsWith('Paso 4')&&!document.getElementById('bono-wz-error').hidden")&&(await stored()).items.length===after3.items.length);
// Storage failure → atomic: nothing saved, error reported.
await js(()=>{document.querySelector('[data-wz-row="2"]').click();});await click('#bono-wz-next');
await js(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='planifica-tus-redes-v2')throw new DOMException('Quota','QuotaExceededError');return window.__setItem.call(this,k,v);};});
await click('#bono-wz-next');
await js(()=>{Storage.prototype.setItem=window.__setItem;});
check('Error de guardado: nada se incorpora y se informa',(await stored()).items.length===after3.items.length&&await evaluate("!document.getElementById('bono-wz-error').hidden&&document.getElementById('bono-wz-error').textContent.includes('No se incorporó ninguna publicación')"));
check('Estado en memoria revertido tras el error',await evaluate("document.querySelector('#desktop-nav [data-page=ideas] .nav-count')?.textContent")===String(after3.items.filter(x=>!x.date).length));
await js(()=>document.getElementById('manager-dialog').close());

// ---------- Original features still work ----------
await click('#desktop-nav [data-page=progress]');
check('Seguimiento cuenta las publicaciones importadas',await evaluate("(()=>{const out=[],q=s=>document.querySelector(s),take=()=>out.push(...[...document.querySelectorAll('.next-item .post-title')].map(e=>e.textContent)),go=d=>{while(q('[data-dir='+d+']')&&!q('[data-dir='+d+']').disabled)q('[data-dir='+d+']').click()};go('prev');take();while(q('[data-dir=next]')&&!q('[data-dir=next]').disabled){q('[data-dir=next]').click();take()}go('prev');return out})().length")===after3.items.filter(x=>x.date).length);
await click('#desktop-nav [data-page=calendar]');
check('Calendario renderiza',await evaluate("!!document.querySelector('.month-grid')"));
await click('#desktop-nav [data-page=clients]');
check('Clientes y cuentas renderiza',await evaluate("document.querySelectorAll('.client-card').length===3"));
check('Respaldo: snapshot incluye los contenidos nuevos',(await stored()).items.length===after3.items.length);

// ---------- Onboarding ----------
const runOnboarding=async(path,finish)=>{
  await seed({tutorial:false,data:false});await reload();
  await click('[data-entry=next]');
  await click(`[data-path=${path}]`);await click('[data-entry=next]');
  if(path==='clients'){await setValue('#entry-client-name','Panadería Sol');await click('[data-entry=next]');}
  await setValue('#entry-username-0','@sol');await click('[data-entry=next]');
  const finishLabel=await evaluate("document.querySelector('[data-entry=next]').textContent");
  await click('[data-entry=next]');
  const slide=await evaluate("({title:document.getElementById('entry-title').textContent,blocks:[...document.querySelectorAll('.entry-bono h2')].map(h=>h.textContent),info:document.querySelector('.entry-info').textContent,progress:document.querySelector('.entry-progress').getAttribute('aria-label'),buttons:[...document.querySelectorAll('.entry-actions .btn')].map(b=>b.textContent.trim())})");
  const beforeFinish=await stored();
  return {finishLabel,slide,beforeFinish};
};
for(const [path,w] of [['clients',1440],['personal',375]]){
  await width(w);
  const {finishLabel,slide,beforeFinish}=await runOnboarding(path);
  check(`Onboarding (${path}): paso previo continúa`,finishLabel==='Continuar');
  check(`Onboarding (${path}): diapositiva de bonos`,slide.title==='🎁 ¡Tus 3 bonos ya están disponibles!'&&JSON.stringify(slide.blocks)===JSON.stringify(['30 ideas de contenido','Guía de organización','Calendarios de ejemplo'])&&slide.info.includes('«Mis bonos»')&&JSON.stringify(slide.buttons)===JSON.stringify(['Ir a mi calendario','Explorar mis bonos']),JSON.stringify(slide));
  check(`Onboarding (${path}): progreso ${path==='clients'?'6 de 6':'5 de 5'}`,slide.progress===(path==='clients'?'Paso 6 de 6':'Paso 5 de 5'));
  await shot(`onboarding-${path}-${w}`);
  check(`Onboarding (${path}): sin desborde`,await evaluate("document.documentElement.scrollWidth<=innerWidth&&(()=>{const c=document.querySelector('.entry-card').getBoundingClientRect();return c.right<=innerWidth+1&&c.bottom<=innerHeight+1})()"));
  const target=path==='clients'?'finish-bonos':'finish-calendar';
  await click(`[data-entry=${target}]`);
  const afterFinish=await stored();
  check(`"${target==='finish-bonos'?'Explorar mis bonos':'Ir a mi calendario'}" finaliza el onboarding`,await evaluate("document.getElementById('entry-screen').hidden&&localStorage.getItem('planifica-tus-redes-tutorial-v1')==='done'"));
  check(`Abre ${target==='finish-bonos'?'Mis bonos':'el calendario'}`,await evaluate(target==='finish-bonos'?"document.querySelector('#desktop-nav [data-page=bonos]').classList.contains('active')&&document.querySelector('#page-header h1').textContent==='Tus herramientas extra para planificar mejor'":"document.querySelector('#desktop-nav [data-page=calendar]').classList.contains('active')&&!!document.querySelector('.month-grid')"));
  check(`Datos del primer cliente sin cambios al finalizar (${path})`,JSON.stringify(afterFinish.clients)===JSON.stringify(beforeFinish.clients)&&JSON.stringify(afterFinish.accounts)===JSON.stringify(beforeFinish.accounts)&&(path!=='clients'||afterFinish.clients.some(c=>c.name==='Panadería Sol')));
  await reload();
  check(`No vuelve a mostrarse el onboarding (${path})`,await evaluate("document.getElementById('entry-screen').hidden"));
}

// ---------- Responsive ----------
await seed();await reload();
const overflow=()=>js(()=>{const vw=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>vw+1)bad.push('page scrollWidth '+document.documentElement.scrollWidth+'>'+vw);
  const scope=document.getElementById('manager-dialog').open?[document.getElementById('manager-dialog')]:[document.getElementById('page-content'),document.getElementById('page-header'),document.getElementById('mobile-nav')];
  for(const s of scope)for(const e of s.querySelectorAll('*')){if(!e.getClientRects().length||e.closest('[hidden]')||e.closest('.dom-select-native')||getComputedStyle(e).clipPath!=='none'||getComputedStyle(e).position==='absolute'&&getComputedStyle(e).opacity==='0')continue;const r=e.getBoundingClientRect();if(r.width&&(r.right>vw+1||r.left<-1))bad.push((e.className||e.tagName)+' '+Math.round(r.left)+'..'+Math.round(r.right));
    if(['BUTTON','H1','H2','H3','STRONG','SPAN','DD','P','LI','LABEL'].includes(e.tagName)&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=='visible')bad.push('clipped '+e.tagName+'.'+e.className+' '+e.textContent.slice(0,30));}
  return [...new Set(bad)].slice(0,6);});
const screens=[['home',null],['ideas',['go',{screen:'ideas'}]],['idea',['idea',{id:'idea-07'}]],['guide',['go',{screen:'guide'}]],['tip',['tip',{id:'tip-03'}]],['checklist',['go',{screen:'checklist'}]],['calendars',['go',{screen:'calendars'}]],['calendar',['calendar',{id:'servicios'}]]];
for(const w of [320,375,430,768,1024,1440]){
  await width(w);await reload();
  await click(`#${w<=790?'mobile':'desktop'}-nav [data-page=bonos]`);
  if(w<=790)check(`Nav móvil ${w}px: 5 accesos legibles`,await evaluate("(()=>{const b=[...document.querySelectorAll('#mobile-nav .nav-btn')];return b.length===5&&b.every(x=>{const r=x.getBoundingClientRect(),t=x.querySelector('span');return r.right<=innerWidth+1&&r.left>=-1&&t.scrollWidth<=t.clientWidth+1&&t.getBoundingClientRect().right<=r.right+1})})()"));
  for(const [name,action] of screens){
    if(action)await go(...action);
    const bad=await overflow();
    check(`${w}px ${name}: sin desbordes`,!bad.length,bad.join(' ; '));
    if([320,768,1024].includes(w)&&['home','idea','tip','checklist','calendar'].includes(name))await shot(`${name}-${w}`);
  }
  await go('calendar',{id:'tiendas'});await click('#bono-use-calendar');await js(()=>document.querySelector('input[name=bono-wz-client][value=c1]').click());await click('#bono-wz-next');await click('#bono-wz-next');await click('#bono-wz-next');
  const dlg=await js(()=>{const d=document.getElementById('manager-dialog').getBoundingClientRect(),b=document.querySelector('#manager-dialog .modal-body');return {fits:d.top>=-1&&d.bottom<=innerHeight+1&&d.right<=innerWidth+1,scrolls:b.scrollHeight>b.clientHeight?getComputedStyle(b).overflowY:'none',footer:document.querySelector('#manager-dialog .modal-footer').getBoundingClientRect().bottom<=innerHeight+1};});
  check(`${w}px asistente: cabe en pantalla y desplaza`,dlg.fits&&dlg.footer&&['auto','scroll','none'].includes(dlg.scrolls),JSON.stringify(dlg));
  const badD=await overflow();check(`${w}px asistente: sin desbordes`,!badD.length,badD.join(' ; '));
  if([320,1440].includes(w))await shot(`wizard-${w}`);
  await js(()=>document.getElementById('manager-dialog').close());
  await go('idea',{id:'idea-12'});await click('#bono-add-idea');
  const badI=await overflow();check(`${w}px diálogo de idea: sin desbordes`,!badI.length,badI.join(' ; '));
  if(w===375)await shot('idea-dialog-375');
  await js(()=>document.getElementById('manager-dialog').close());
}

// ---------- Keyboard ----------
await width(1440);await reload();await click('#desktop-nav [data-page=bonos]');await click('#bono-open-ideas');
await js(()=>document.querySelector('[data-filter=autoridad]').focus());
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:String.fromCharCode(13)});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(60);
check('Filtros operables con teclado',await evaluate("document.querySelector('[data-filter=autoridad]').getAttribute('aria-pressed')==='true'&&document.activeElement.dataset.filter==='autoridad'"));
await js(()=>document.querySelector('[data-bono=idea][data-id=idea-13]').focus());
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:String.fromCharCode(13)});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(80);
check('Abrir idea con teclado mueve el foco al título',await evaluate("document.activeElement===document.querySelector('#page-header h1')&&document.activeElement.textContent.startsWith('Un caso real')"));

check('Sin errores de JavaScript ni CSP',!errors.length,errors.slice(0,3).join(' | '));
console.log(failures?`\n${failures} verificaciones fallidas`:'\nTodas las verificaciones pasaron');
ws.close();proc.kill();server.close();await wait(300);await rm(profile,{recursive:true,force:true}).catch(()=>{});
process.exit(failures?1:0);
