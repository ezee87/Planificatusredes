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
const measurements=[];
const {scanContrast}=await import('./contrast-scan.mjs');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const check=(name,value,detail='')=>{if(!value)throw Error(`${name}${detail?`: ${detail}`:''}`);results.push({name,status:'OK'});};
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(req.method==='POST'){res.writeHead(200);res.end('ok');return;}let file='index.html';if(pathname==='/commercial.js')file='commercial.js';else if(pathname==='/commercial.css')file='commercial.css';else if(pathname==='/fonts/inter-latin-wght.woff2')file='fonts/inter-latin-wght.woff2';else if(pathname.startsWith('/legal/')||pathname==='/arrepentimiento')file='legal/index.html';try{const body=await readFile(join(root,'dist',file));const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':csp});res.end(body);}catch{res.writeHead(404);res.end('not found');}});
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
  const capture=async label=>{await wait(140);measurements.push({label,rows:await evaluate('('+scanContrast.toString()+')()')});};
  await capture('activation');
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');const d=new Date();const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');localStorage.setItem('planifica-tus-redes-v2',JSON.stringify({app:'Planifica tus Redes',version:2,clients:[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'qa',name:'Cliente QA',description:'Descripcion',color:'#a79bb6'}],accounts:[{id:'acc',clientId:'qa',platform:'instagram',username:'@qa',name:'Cuenta'}],items:['instagram','tiktok','linkedin','facebook','youtube','pinterest','twitter','otra'].map((platform,i)=>({id:'qa-'+i,title:'Contenido '+i,caption:'Texto de prueba',platform,type:'post',status:['idea','preparation','ready','published'][i%4],date:i<4?date:null,clientId:'qa',accountId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})),preferences:{}}))`);await reload();await wait(150);
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<790});
    for(const section of ['calendar','ideas','progress','clients']){await click('#desktop-nav [data-page="'+section+'"]');await capture(section+'-'+width);}
    await click('#desktop-nav [data-page="calendar"]');await click('[data-action="mode"][data-mode="week"]');await capture('week-'+width);
    await click('[data-action="new-post"]');await capture('modal-'+width);await click('[data-action="close-modal"]');
    await click('#desktop-nav [data-page="clients"]');await click('[data-action="client-new"]');await capture('client-modal-'+width);await click('#manager-cancel');
    await click('[data-action="help"]');await capture('help-'+width);await click('[data-support-open="support"]');await capture('support-'+width);await click('[data-support-close]');await click('[data-support-open="claim"]');await capture('claim-'+width);
  }
  for(const slug of ['licencia','privacidad','arrepentimiento']){await send('Page.navigate',{url:`http://127.0.0.1:${port}/`+(slug==='arrepentimiento'?slug:'legal/'+slug)});await wait(180);await capture(slug);}
  await writeFile(join(root,'tests',process.argv[2]||'contraste-antes.json'),JSON.stringify(measurements,null,2));
  const fails=measurements.flatMap(x=>x.rows.filter(r=>!r.pass).map(r=>({...r,page:x.label})));const unique=new Map(fails.map(x=>[[x.selector,x.fg,x.bg,x.kind].join('|'),x]));console.log(JSON.stringify([...unique.values()],null,2));
} finally {
  ws.close();proc.kill();await new Promise(r=>proc.once('exit',r));server.close();
  for(const dir of [profile,downloads,fixtures]){for(let attempt=0;attempt<5;attempt++){try{await rm(dir,{recursive:true,force:true,maxRetries:2,retryDelay:100});break;}catch(error){if(attempt===4)console.error(`No se pudo limpiar ${dir}: ${error.message}`);await wait(150);}}}
}
console.log(JSON.stringify(results,null,2));
