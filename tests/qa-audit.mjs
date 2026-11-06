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
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const check=(name,value,detail='')=>{if(!value)throw Error(`${name}${detail?`: ${detail}`:''}`);results.push({name,status:'OK'});};
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(req.method==='POST'){res.writeHead(200);res.end('ok');return;}let file='index.html';if(['/custom-selects.js','/custom-selects.css','/bonos-data.js','/bonos.js','/bonos.css'].includes(pathname))file=pathname.slice(1);else if(pathname==='/commercial.js')file='commercial.js';else if(pathname==='/commercial.css')file='commercial.css';else if(pathname==='/fonts/inter-latin-wght.woff2')file='fonts/inter-latin-wght.woff2';else if(pathname.startsWith('/legal/')||pathname==='/arrepentimiento')file='legal/index.html';try{const body=await readFile(join(root,'dist',file));const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':csp});res.end(body);}catch{res.writeHead(404);res.end('not found');}});
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
let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {ok,fail}=pending.get(m.id);pending.delete(m.id);m.error?fail(Error(m.error.message)):ok(m.result);}};
const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,{ok,fail});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression,awaitPromise=true)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const waitForPage=async()=>{for(let i=0;i<100;i++){try{if(await evaluate(`document.readyState==='complete' && document.querySelector('#entry-screen')!==null`))return;}catch{}await wait(50);}throw Error('La página no terminó de cargar');};
const reload=async()=>{await send('Page.reload',{ignoreCache:true});await waitForPage();};
try{
  await send('Page.enable');await send('Runtime.enable');await waitForPage();
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done')`);await reload();
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const data=()=>evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2'))`);
  const tab=async(shift=false)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:shift?8:0});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});};
  await click('[data-action="client-new"]'.replace('client-new','new-post'));
  check('Modal aísla el fondo',await evaluate(`document.querySelector('.app').inert&&document.querySelector('#mobile-nav').inert`));
  await evaluate(`document.querySelector('#modal-submit').focus()`);await tab();
  check('Tab contenido en modal',await evaluate(`document.activeElement.id==='modal-close-icon'`));
  await tab(true);check('Shift Tab contenido en modal',await evaluate(`document.activeElement.id==='modal-submit'`));
  const payload='<img src=x onerror="window.auditXSS=1"><script>window.auditXSS=1</script>';
  await evaluate(`document.querySelector('#item-title').value=${JSON.stringify(payload)};document.querySelector('#item-text').value=${JSON.stringify(payload)};document.querySelector('#item-form').requestSubmit()`);
  check('Crear publicación y guardar', (await data()).items.length===1);
  check('XSS se muestra como texto',await evaluate(`!window.auditXSS&&!document.querySelector('#page-content img')&&document.querySelector('#page-content').textContent.includes('<img')`));
  check('Foco recuperado después de guardar',await evaluate(`document.activeElement!==document.body&&!document.querySelector('.app').inert&&!document.querySelector('#mobile-nav').inert`));
  await click('[data-action="edit"]');
  await evaluate(`document.querySelector('#item-date').value='';document.querySelector('#item-status').value='ready';document.querySelector('#item-form').requestSubmit()`);
  check('Mover al banco conserva estado',(await data()).items[0].date===null&&(await data()).items[0].status==='ready');
  await click('#desktop-nav [data-page="ideas"]');await click('[data-action="plan"]');
  await evaluate(`document.querySelector('#item-date').value='2026-10-21';document.querySelector('#item-form').requestSubmit()`);
  check('Planificar idea existente',(await data()).items[0].date==='2026-10-21');
  await click('#desktop-nav [data-page="clients"]');await click('[data-action="client-new"]');
  await evaluate(`document.querySelector('#client-name').value=${JSON.stringify(payload)};document.querySelector('#manager-form').requestSubmit()`);
  check('Crear cliente seguro',(await data()).clients.length===2&&await evaluate(`!window.auditXSS`));
  await click('[data-action="client-edit"]');
  await evaluate(`document.querySelector('#client-description').value='Descripción QA';document.querySelector('#manager-form').requestSubmit()`);
  check('Editar cliente',(await data()).clients.some(x=>x.description==='Descripción QA'));
  const client=(await data()).clients.find(x=>x.id!=='personal');
  await click('[data-action="account-new"][data-id="'+client.id+'"]');
  await evaluate(`document.querySelector('#account-username').value='@prueba';document.querySelector('#manager-form').requestSubmit()`);
  check('Crear cuenta',(await data()).accounts.length===1);
  await reload();check('Persistencia cliente y cuenta',(await data()).accounts[0].username==='@prueba');
  await click('#desktop-nav [data-page="calendar"]');await click('[data-action="new-post"]');
  const beforeQuota=await data();
  await evaluate(`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError')};document.querySelector('#item-title').value='No debe guardarse';document.querySelector('#item-form').requestSubmit()`);
  check('Cuota agotada conserva modal y datos',canonical(await data())===canonical(beforeQuota)&&await evaluate(`document.querySelector('#modal-overlay').classList.contains('open')&&document.querySelector('#toast').textContent.includes('No se pudo guardar')`));
  await evaluate(`Storage.prototype.setItem=window.originalSetItem`);await click('[data-action="close-modal"]');
  // Real file input, malformed and hostile JSON, cancellation and atomic import.
  const backup=await data();
  const importFile=async(text,name='audit.json')=>{const path=join(fixtures,name);await writeFile(path,text);const node=(await send('DOM.querySelector',{nodeId:(await send('DOM.getDocument')).root.nodeId,selector:'#import-file'})).nodeId;await send('DOM.setFileInputFiles',{nodeId:node,files:[path]});await wait(100);};
  for(const [label,contents] of [['JSON roto','{'],['prototype pollution',JSON.stringify(backup).replace('"version":2','"version":2,"__proto__":{"polluted":true}')],['cliente null',JSON.stringify({...backup,clients:[null]})],['fecha inválida',JSON.stringify({...backup,items:[{...backup.items[0],date:'2026-02-30'}]})],['preferencias inválidas',JSON.stringify({...backup,preferences:[]})]]){
    await importFile(contents);check(label+' rechazado sin pérdida',canonical(await data())===canonical(backup)&&await evaluate(`document.querySelector('#toast').textContent.includes('No se pudo importar')`));
  }
  await importFile(' '.repeat(20*1024*1024+1));check('Límite 20 MiB previo al parseo',await evaluate(`document.querySelector('#toast').textContent.includes('demasiado grande')`));
  let dialogSeen=false;
  const cancel=async e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening'){dialogSeen=true;await send('Page.handleJavaScriptDialog',{accept:false});}};ws.addEventListener('message',cancel);
  await importFile(JSON.stringify({...backup,items:[]}));ws.removeEventListener('message',cancel);
  check('Cancelar importación conserva datos',dialogSeen&&canonical(await data())===canonical(backup));
  for(let i=0;i<3;i++){await click('[data-action="help"]');await click('#desktop-nav [data-page="calendar"]');}
  await click('[data-action="help"]');await click('[data-support-open="support"]');
  check('Soporte enfoca email visible',await evaluate(`document.activeElement.id==='support-email'`));
  await click('[data-support-close]');check('Volver restaura foco',await evaluate(`document.activeElement.dataset.supportOpen==='support'`));
  await click('[data-commercial-doc="privacidad"]');check('Documento recibe foco',await evaluate(`document.activeElement.hasAttribute('data-commercial-back')`));
  await click('[data-commercial-back]');check('Documento restaura foco',await evaluate(`document.activeElement.dataset.commercialDoc==='privacidad'`));
  for(const page of ['calendar','ideas','progress','clients']){
    await click('#desktop-nav [data-page="'+page+'"]');
    for(const width of [320,640,1280]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});check(page+' reflow '+width,await evaluate(`document.documentElement.scrollWidth<=innerWidth`));}
  }
  // Destructive operations are exercised only on this temporary profile.
  await click('#desktop-nav [data-page="calendar"]');await click('[data-action="new-post"]');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  check('Escape cierra modal',await evaluate(`!document.querySelector('#modal-overlay').classList.contains('open')&&!document.querySelector('.app').inert&&!document.querySelector('#mobile-nav').inert`));
  await click('[data-action="new-post"]');await evaluate(`document.querySelector('#item-title').value='Delete QA';document.querySelector('#item-form').requestSubmit()`);
  const beforeDelete=(await data()).items.length;
  await click('[data-action="mode"][data-mode="week"]');
  await evaluate(`document.querySelector('[data-drag-id]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  check('Asa de arrastre operable con teclado',await evaluate(`document.activeElement.id==='item-date'&&document.querySelector('#modal-overlay').classList.contains('open')`));
  let deletionDialog=false;
  const accept=async e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening'){deletionDialog=true;await send('Page.handleJavaScriptDialog',{accept:true});}};ws.addEventListener('message',accept);
  await click('[data-action="delete-item"]');await wait(60);ws.removeEventListener('message',accept);
  check('Eliminar contenido con confirmacion',deletionDialog&&(await data()).items.length===beforeDelete-1);
  await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await click('#desktop-nav [data-page="ideas"]');await click('[data-action="new-idea"]');await evaluate(`document.querySelector('#item-title').value='Idea offline';document.querySelector('#item-form').requestSubmit()`);
  check('Edición offline con página cargada',(await data()).items.some(x=>x.title==='Idea offline'));
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:0,uploadThroughput:0});
  // Corrupted local storage must remain byte-for-byte intact.
  await evaluate(`localStorage.setItem('planifica-tus-redes-v2','{broken')`);await reload();
  await click('[data-action="export"]');
  check('Datos ilegibles no se sobrescriben ni exportan vacios',await evaluate(`localStorage.getItem('planifica-tus-redes-v2')==='{broken'&&document.querySelector('#toast').textContent.includes('original')`));
} finally {
  ws.close();proc.kill();await new Promise(r=>proc.once('exit',r));server.close();
  for(const dir of [profile,downloads,fixtures]){for(let attempt=0;attempt<5;attempt++){try{await rm(dir,{recursive:true,force:true,maxRetries:2,retryDelay:100});break;}catch(error){if(attempt===4)console.error(`No se pudo limpiar ${dir}: ${error.message}`);await wait(150);}}}
}
console.log(JSON.stringify(results,null,2));
