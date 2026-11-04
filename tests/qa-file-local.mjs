import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root=resolve(import.meta.dirname,'..');
const profile=await mkdtemp(join(tmpdir(),'planifica-file-qa-'));
const url=pathToFileURL(join(root,'index.html')).href;
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const proc=spawn(chrome,[`--user-data-dir=${profile}`,'--headless=new','--no-first-run','--disable-default-apps','--remote-debugging-port=0',url],{stdio:['ignore','ignore','pipe']});
let stderr='';proc.stderr.on('data',d=>stderr+=d);
let port;
for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];break;}catch{await new Promise(r=>setTimeout(r,50));}}
if(!port)throw Error(`Chrome no inició: ${stderr}`);
const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page=tabs.find(x=>x.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
let seq=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result);}};
const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,{ok,fail});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,value)=>{if(!value)throw Error(name);console.log(`OK: ${name}`);};
try{
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
  for(let i=0;i<40&&!await evaluate(`document.readyState==='complete'&&typeof window.PlanificaCommercial?.renderHelp==='function'`);i++)await wait(50);
  check('Carga file:// sin errores JavaScript',errors.length===0);
  check('Módulo comercial cargado desde archivo relativo',await evaluate(`typeof window.PlanificaCommercial?.renderHelp==='function'`));
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');location.reload()`);await wait(350);
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});await wait(80);
  await evaluate(`document.querySelector('.mobile-help').click()`);await wait(80);
  check('Ayuda reemplaza el calendario a 393 × 852',await evaluate(`document.querySelector('.support-home')&&!document.querySelector('.month-grid')&&document.documentElement.scrollWidth<=innerWidth`));
  check('Copyright global unico en Ayuda',await evaluate(`document.querySelectorAll('.support-footer').length===1&&document.querySelector('.app-footer p').textContent.trim()==='© 2026 Planifica tus redes'`));
  check('Disclaimer retirado y respaldos conservados',await evaluate(`!document.querySelector('.local-note')&&document.querySelectorAll('.sidebar-bottom .backup-btn').length===2`));
  await evaluate(`document.querySelector('[data-support-open="support"]').click()`);
  check('Abre formulario de soporte',await evaluate(`!document.querySelector('#support-form-panel').hidden`));
  check('Footer global unico al final del formulario',await evaluate(`document.querySelectorAll('.support-footer').length===1&&document.querySelector('.app-footer').getClientRects().length>0`));
  await evaluate(`document.querySelector('[data-support-close]').click();document.querySelector('[data-support-open="claim"]').click()`);
  check('Abre formulario de reclamos',await evaluate(`!document.querySelector('#claim-form-panel').hidden`));
  await evaluate(`document.querySelector('[data-support-close]').click();document.querySelector('[data-commercial-doc="licencia"]').click()`);
  check('Abre documento legal interno',await evaluate(`document.querySelector('.legal-document').textContent.includes('Licencia de uso de Planifica tus redes')`));
  check('Footer global unico al final del documento',await evaluate(`document.querySelectorAll('.support-footer').length===1&&document.querySelector('.app-footer').getClientRects().length>0`));
  await evaluate(`document.querySelector('[data-commercial-back]').click();document.querySelector('[data-action="nav"][data-page="calendar"]').click()`);await wait(60);
  check('Regresa al calendario',await evaluate(`!!document.querySelector('.month-grid')`));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await wait(60);
  for(const pageName of ['ideas','progress','clients','calendar']){await evaluate(`document.querySelector('#desktop-nav [data-page="${pageName}"]').click()`);await wait(30);check(`Navegación existente: ${pageName}`,await evaluate(`document.querySelector('#desktop-nav [data-page="${pageName}"]').classList.contains('active')`));}
  await evaluate(`document.querySelector('[data-action="help"]').click();document.querySelector('[data-support-open="support"]').click();window.localPostCalls=0;window.fetch=()=>{window.localPostCalls++;throw Error('Unexpected network')};const f=document.querySelector('#support-form-panel form');f.email.value='qa@example.com';f.motivo.value='Problema técnico';f.descripcion.value='Prueba local';f.requestSubmit()`);
  check('file: explica envio desde version publicada',await evaluate(`document.querySelector('#support-form-panel .commercial-message').textContent.includes('publicada en Netlify')&&!!document.querySelector('#support-form-panel .commercial-message a[href="mailto:soporte.planificatusredes@gmail.com"]')`));
  check('file: no simula exito ni intenta POST',await evaluate(`window.localPostCalls===0&&!document.querySelector('#support-form-panel .commercial-message').classList.contains('success')`));
  check('Sin errores de consola tras navegar',errors.length===0);
} finally {
  ws.close();proc.kill();await new Promise(r=>proc.once('exit',r));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
