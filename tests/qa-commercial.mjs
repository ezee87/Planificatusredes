import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const html=await readFile(join(root,'dist','index.html'));
const csp=(await readFile(join(root,'dist','_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const profile=await mkdtemp(join(tmpdir(),'planifica-qa-profile-'));
const downloads=await mkdtemp(join(tmpdir(),'planifica-qa-downloads-'));
const fixtures=await mkdtemp(join(tmpdir(),'planifica-qa-fixtures-'));
const results=[];
const posted=[];let postStatus=200,postDelay=0;
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const check=(name,value,detail='')=>{if(!value)throw Error(`${name}${detail?`: ${detail}`:''}`);results.push({name,status:'OK'});};
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;posted.push({path:pathname,method:req.method,type:req.headers['content-type'],body});const status=postStatus;await new Promise(r=>setTimeout(r,postDelay));res.writeHead(status);res.end('local test response');return;}let file='index.html';if(['/custom-selects.js','/custom-selects.css','/bonos-data.js','/bonos.js','/bonos.css'].includes(pathname))file=pathname.slice(1);else if(pathname==='/commercial.js')file='commercial.js';else if(pathname==='/commercial.css')file='commercial.css';else if(pathname==='/favicon.svg')file='favicon.svg';else if(pathname.startsWith('/legal/')||pathname==='/arrepentimiento')file='legal/index.html';try{const body=await readFile(join(root,'dist',file));const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':csp});res.end(body);}catch{res.writeHead(404);res.end('not found');}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const proc=spawn(chrome,[`--user-data-dir=${profile}`,'--headless=new','--no-first-run','--disable-default-apps','--remote-debugging-port=0',`http://127.0.0.1:${port}`],{stdio:['ignore','ignore','pipe']});
let stderr='';proc.stderr.on('data',d=>stderr+=d);
const activePortFile=join(profile,'DevToolsActivePort');
let debugPort;
for(let i=0;i<100;i++){try{debugPort=(await readFile(activePortFile,'utf8')).split(/\r?\n/)[0];break;}catch{await new Promise(r=>setTimeout(r,50));}}
if(!debugPort)throw Error(`Chrome no inició: ${stderr}`);
const tabs=await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page=tabs.find(x=>x.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
let seq=0;const pending=new Map(),consoleErrors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')consoleErrors.push(m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')consoleErrors.push(m.params.entry.text);if(m.id&&pending.has(m.id)){const {ok,fail}=pending.get(m.id);pending.delete(m.id);m.error?fail(Error(m.error.message)):ok(m.result);}};
const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,{ok,fail});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression,awaitPromise=true)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const waitForPage=async()=>{for(let i=0;i<100;i++){try{if(await evaluate(`document.readyState==='complete' && document.querySelector('#entry-screen')!==null`))return;}catch{}await wait(50);}throw Error('La página no terminó de cargar');};
const reload=async()=>{await send('Page.reload',{ignoreCache:true});await waitForPage();};
try{
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
  await waitForPage();
  await evaluate(`localStorage.clear()`);await reload();
  check('Pantalla de acceso visible',await evaluate(`document.querySelector('#access-code')!==null`));
  await evaluate(`document.querySelector('#access-code').value='CODIGO-INVALIDO';document.querySelector('#activation-form').requestSubmit()`);await wait(150);
  check('Código inválido rechazado',await evaluate(`!document.querySelector('#access-error').hidden && document.querySelector('#access-error').textContent.includes('no parece correcto')`));

  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active')`);await reload();
  check('Persistencia de activación leída',await evaluate(`document.querySelector('#access-code')===null && !document.querySelector('#entry-screen').hidden`));
  for(let i=0;i<3;i++){await evaluate(`document.querySelector('[data-entry="next"]').click()`);await wait(80);}
  const warning='Tu información se guarda en este navegador. Te recomendamos exportar un respaldo periódicamente para no perder tus publicaciones si cambiás de dispositivo o borrás los datos del navegador.';
  check('Advertencia en la última pantalla del tutorial',await evaluate(`document.querySelector('#entry-screen').textContent.includes(${JSON.stringify(warning)})`));
  await evaluate(`document.querySelector('[data-entry="next"]').click()`);await wait(100);
  check('Diapositiva de bonos antes de finalizar',await evaluate(`document.querySelector('#entry-screen .entry-bonos')!==null && document.querySelector('#entry-screen').textContent.includes('¡Tus 3 bonos ya están disponibles!')`));
  await evaluate(`document.querySelector('[data-entry="finish-calendar"]').click()`);await wait(100);
  check('Tutorial finaliza y persiste',await evaluate(`localStorage.getItem('planifica-tus-redes-tutorial-v1')==='done' && document.querySelector('#entry-screen').hidden`));

  await evaluate(`document.querySelector('[data-action="help"]').click()`);await wait(80);
  check('Ayuda y soporte abre desde desktop',await evaluate(`document.querySelector('#page-content').textContent.includes('¿Necesitás ayuda?')`));
  check('Navegación inferior conserva sus secciones y suma Mis bonos',await evaluate(`document.querySelectorAll('#mobile-nav .nav-btn').length===5&&!!document.querySelector('#mobile-nav [data-page="bonos"]')&&!document.querySelector('#mobile-nav [data-action="help"]')`));
  check('Cinco documentos disponibles en Ayuda',await evaluate(`document.querySelectorAll('[data-commercial-doc]').length===5`));
  for(const [slug,heading] of [['terminos','Términos y condiciones de Planifica tus redes'],['licencia','Licencia de uso de Planifica tus redes'],['privacidad','Política de privacidad de Planifica tus redes'],['devoluciones','Política de devoluciones y arrepentimiento'],['respaldos','Tus datos y respaldos']]){
    await evaluate(`document.querySelector('[data-commercial-doc="${slug}"]').click()`);await wait(25);
    check(`Documento interno: ${slug}`,await evaluate(`document.querySelector('.legal-document').textContent.includes(${JSON.stringify(heading)})&&!!document.querySelector('[data-commercial-back]')`));
    if(slug==='devoluciones')check('Enlace interno de arrepentimiento unificado',await evaluate(`document.querySelector('.legal-document a[href="https://planificatusredes.netlify.app/contacto.html"]')?.textContent==='BOTÓN DE ARREPENTIMIENTO'`));
    await evaluate(`document.querySelector('[data-commercial-back]').click()`);
  }
  await evaluate(`document.querySelector('[data-support-open="support"]').click()`);
  check('Formulario de soporte accesible',await evaluate(`!document.querySelector('#support-form-panel').hidden&&document.querySelector('[name="planifica-soporte"] [name="email"]').required`));
  await evaluate(`document.querySelector('[name="planifica-soporte"]').requestSubmit()`);await wait(30);
  check('Formulario vacío no se envía',await evaluate(`!document.querySelector('[name="planifica-soporte"]').checkValidity()`));
  await evaluate(`(()=>{const f=document.querySelector('[name="planifica-soporte"]');f.email.value='persona@example.com';f.motivo.value='Problema técnico';f.descripcion.value='Descripción de prueba sin datos privados.';f.requestSubmit()})()`);await wait(120);
  check('Éxito mostrado sólo tras respuesta aceptada',await evaluate(`document.querySelector('[name="planifica-soporte"] .commercial-message').textContent.includes('Consulta recibida')`));
  for(const [slug,heading] of [['terminos','Términos y condiciones de Planifica tus redes'],['licencia','Licencia de uso de Planifica tus redes'],['privacidad','Política de privacidad de Planifica tus redes'],['devoluciones','Política de devoluciones y arrepentimiento'],['respaldos','Tus datos y respaldos']]){
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/legal/${slug}`});await wait(180);
    check(`Documento público sin activación: ${slug}`,await evaluate(`!document.querySelector('#access-code')&&document.querySelector('.legal-document').textContent.includes(${JSON.stringify(heading)})`));
  }
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});await waitForPage();

  const v2={app:'Planifica tus Redes',version:2,items:[
    {id:'post-1',title:'Publicación ficticia',caption:'Texto QA',platform:'instagram',type:'carrusel',status:'ready',date:'2026-10-14',clientId:'client-1',accountId:'account-1',createdAt:'2026-10-01T12:00:00.000Z',updatedAt:'2026-10-02T12:00:00.000Z'},
    {id:'idea-1',title:'Idea ficticia',caption:'Idea QA',platform:'linkedin',type:'post',status:'idea',date:null,clientId:'personal',accountId:null,createdAt:'2026-10-03T12:00:00.000Z',updatedAt:'2026-10-03T12:00:00.000Z'}
  ],clients:[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'client-1',name:'Cliente QA',description:'Sólo pruebas',color:'#a79bb6'}],accounts:[{id:'account-1',clientId:'client-1',platform:'instagram',username:'qa_cuenta',name:'Cuenta QA'}],preferences:{clientFilter:'client-1',platformFilter:'instagram',mode:'week'}};
  await evaluate(`localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(v2))})`);await reload();
  check('Publicaciones, clientes, cuentas y filtros cargados',await evaluate(`(()=>{const x=JSON.parse(localStorage.getItem('planifica-tus-redes-v2'));return x.items.length===2&&x.clients.length===2&&x.accounts.length===1&&x.preferences.clientFilter==='client-1'&&x.preferences.platformFilter==='instagram'&&x.preferences.mode==='week'})()`));
  check('Vista semanal funciona',await evaluate(`document.querySelector('.desktop-week-view')!==null`));
  await evaluate(`document.querySelector('[data-action="export"]').click()`);await wait(300);
  let exportedName;
  for(let attempt=0;attempt<100;attempt++){
    exportedName=(await readdir(downloads)).find(x=>x.endsWith('.json'));
    if(exportedName)break;
    await wait(50);
  }
  check('Exportación JSON generada',!!exportedName);
  const exported=JSON.parse(await readFile(join(downloads,exportedName),'utf8'));
  // Multi-network migration: every legacy field is kept and each item also exports its single network.
  const v2Migrated={...v2,items:v2.items.map(x=>({...x,networks:[{platform:x.platform,accountId:x.accountId}]}))};
  check('Exportación conserva datos y relaciones',canonical({...exported,exportedAt:undefined})===canonical({...v2Migrated,exportedAt:undefined}));

  const exportedPath=join(fixtures,'respaldo-v2.json');await writeFile(exportedPath,JSON.stringify(exported));
  await evaluate(`localStorage.removeItem('planifica-tus-redes-v2')`);await reload();
  const doc=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#import-file'});
  let dialogSeen=false;const dialogHandler=async e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening'){dialogSeen=true;await send('Page.handleJavaScriptDialog',{accept:true});}};ws.addEventListener('message',dialogHandler);
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[exportedPath]});await wait(350);ws.removeEventListener('message',dialogHandler);
  check('Importación v2 solicita confirmación',dialogSeen);
  const restored=JSON.parse(await evaluate(`localStorage.getItem('planifica-tus-redes-v2')`));
  check('Restauración v2 idéntica',canonical(restored)===canonical(v2Migrated));

  const v1={app:'Planifica tus Redes',version:1,items:[{id:'legacy-1',title:'Legado QA',caption:'v1',platform:'facebook',type:'post',status:'published',date:'2026-09-30',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-02T00:00:00.000Z'}]};
  const v1Path=join(fixtures,'respaldo-v1.json');await writeFile(v1Path,JSON.stringify(v1));
  const input2=(await send('DOM.querySelector',{nodeId:(await send('DOM.getDocument')).root.nodeId,selector:'#import-file'})).nodeId;
  const accept=async e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')await send('Page.handleJavaScriptDialog',{accept:true});};ws.addEventListener('message',accept);
  await send('DOM.setFileInputFiles',{nodeId:input2,files:[v1Path]});await wait(300);ws.removeEventListener('message',accept);
  check('Compatibilidad de importación v1',await evaluate(`(()=>{const x=JSON.parse(localStorage.getItem('planifica-tus-redes-v2'));return x.items[0].id==='legacy-1'&&x.items[0].clientId==='personal'&&x.clients.length===1&&x.accounts.length===0})()`));

  const invalidPath=join(fixtures,'invalido.json');await writeFile(invalidPath,'{"app":"Planifica tus Redes","version":99}');
  const beforeInvalid=await evaluate(`localStorage.getItem('planifica-tus-redes-v2')`);const input3=(await send('DOM.querySelector',{nodeId:(await send('DOM.getDocument')).root.nodeId,selector:'#import-file'})).nodeId;
  await send('DOM.setFileInputFiles',{nodeId:input3,files:[invalidPath]});await wait(200);
  check('Archivo inválido rechazado sin alterar datos',(await evaluate(`localStorage.getItem('planifica-tus-redes-v2')`))===beforeInvalid && await evaluate(`document.querySelector('#toast').textContent.includes('Formato no compatible')`));

  await evaluate(`localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(v2))})`);await reload();
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await wait(80);
  for(const pageName of ['ideas','progress','clients','calendar']){await evaluate(`document.querySelector('.nav-btn[data-page="${pageName}"]').click()`);await wait(60);check(`Navegación: ${pageName}`,await evaluate(`document.querySelector('.nav-btn[data-page="${pageName}"]').classList.contains('active')`));}
  await evaluate(`document.querySelector('[data-action="mode"][data-mode="month"]').click()`);await wait(60);check('Vista mensual funciona',await evaluate(`document.querySelector('.month-grid')!==null`));
  await evaluate(`document.querySelector('[data-action="mode"][data-mode="week"]').click()`);await wait(60);check('Cambio de mensual a semanal',await evaluate(`document.querySelector('.desktop-week-view')!==null`));
  const dragPoints=await evaluate(`(()=>{const handle=document.querySelector('[data-drag-id="post-1"]');handle.scrollIntoView({block:'center'});const a=handle.getBoundingClientRect(),b=document.querySelector('[data-drop-date="2026-10-15"]').getBoundingClientRect();return {from:{x:a.left+a.width/2,y:a.top+a.height/2},to:{x:b.left+b.width/2,y:b.top+b.height/2}}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:dragPoints.from.x,y:dragPoints.from.y,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoints.from.x+15,y:dragPoints.from.y+15,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoints.to.x,y:dragPoints.to.y,button:'left',buttons:1});
  const dragDiagnostic=await evaluate(`({dragging:document.body.classList.contains('dragging'),target:document.querySelector('[data-drop-date="2026-10-15"]').classList.contains('drop-active')})`);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragPoints.to.x,y:dragPoints.to.y,button:'left',buttons:0,clickCount:1});await wait(120);
  check('Arrastre de publicación en desktop',await evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.find(x=>x.id==='post-1').date==='2026-10-15'`),JSON.stringify(dragDiagnostic));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(120);
  check('Vista mobile activa',await evaluate(`innerWidth===390 && getComputedStyle(document.querySelector('#mobile-nav')).display!=='none'`));
  await evaluate(`document.querySelector('[data-action="edit"][data-id="post-1"]').click()`);await wait(80);
  await evaluate(`document.querySelector('#item-date').value='2026-10-20';document.querySelector('#item-form').requestSubmit()`);await wait(120);
  check('Modificación de fecha en mobile',await evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.find(x=>x.id==='post-1').date==='2026-10-20'`));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await wait(80);
  check('Vista desktop restaurada',await evaluate(`innerWidth>790 && getComputedStyle(document.querySelector('.sidebar')).display!=='none'`));
  await evaluate(`document.querySelector('[data-action="help"]').click()`);await wait(50);
  for(const width of [320,375,393,430,768,1440,1920]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=768});await wait(50);
    check(`Ayuda sin scroll horizontal a ${width}px`,await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  }
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/legal/privacidad`});await wait(160);
  for(const width of [320,375,393,430,768,1440,1920]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=768});await wait(35);
    check(`Documento público legible a ${width}px`,await evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.legal-document').getBoundingClientRect().width<=innerWidth`));
  }
  const {verifyRelease}=await import('./release-checks.mjs');
  await verifyRelease({send,evaluate,wait,check,root,port,posted,setPost:(status,delay=0)=>{postStatus=status;postDelay=delay;}});
  const cspErrors=consoleErrors.filter(x=>/content security policy|refused to/i.test(x));
  const unexpectedErrors=consoleErrors.filter(x=>!/status of 500 \(Internal Server Error\)/i.test(x));
  check('CSP aplicada sin errores de consola',cspErrors.length===0,cspErrors.join(' | '));
  check('Sin errores inesperados de consola',unexpectedErrors.length===0,unexpectedErrors.join(' | '));
} finally {
  ws.close();proc.kill();await new Promise(r=>proc.once('exit',r));server.close();
  for(const dir of [profile,downloads,fixtures]){for(let attempt=0;attempt<5;attempt++){try{await rm(dir,{recursive:true,force:true,maxRetries:2,retryDelay:100});break;}catch(error){if(attempt===4)console.error(`No se pudo limpiar ${dir}: ${error.message}`);await wait(150);}}}
}
console.log(JSON.stringify(results,null,2));
