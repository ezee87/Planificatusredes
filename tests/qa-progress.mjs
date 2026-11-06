// Focused browser checks for DOM selects. Uses an isolated Chrome profile and
// a local server with the real CSP; it never sends forms to external services.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve,basename,sep} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'planifica-selects-'));
const csp=(await readFile(join(root,'_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const posts=[];
const server=createServer(async(req,res)=>{
  if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;posts.push(body);res.writeHead(200);res.end('local response');return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','commercial.js','commercial.css','custom-selects.js','custom-selects.css','bonos-data.js','bonos.js','bonos.css','favicon.svg','fonts/inter-latin-wght.woff2'].includes(file)){res.writeHead(404);res.end();return;}
  const body=await readFile(join(root,file));
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8','Content-Security-Policy':csp});res.end(body);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url=`http://127.0.0.1:${server.address().port}/`;
const proc=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[`--user-data-dir=${profile}`,'--headless=new','--no-first-run','--disable-default-apps','--remote-debugging-port=0',url],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let port;
for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];break;}catch{await wait(50);}}
if(!port)throw Error('Chrome did not start');
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
await new Promise(ok=>ws.onopen=ok);let seq=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const check=async(name,expression)=>{if(!await evaluate(expression))throw Error(name);console.log('OK '+name);};
const click=async selector=>{
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await wait(20);
};
const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers});await wait(10);};
const touch=async selector=>{
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(25);
};
const choose=async(id,value)=>{
 await click('#'+id+'-combobox');
 const index=await evaluate(`[...document.getElementById(${JSON.stringify(id)}).options].findIndex(o=>o.value===${JSON.stringify(value)})`);
 if(index<0)throw Error('Missing option '+id+' '+value);
 await click('.dom-select-panel [data-index="'+index+'"]');
 await check(id+' selection '+value,`document.getElementById(${JSON.stringify(id)}).value===${JSON.stringify(value)}&&!document.querySelector('.dom-select-panel')`);
};
const fill=async(id,text)=>{await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.focus();e.select();})()`);await send('Input.insertText',{text});};
const ready=async()=>{for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&!!window.PlanificaSelects`))return;await wait(50);}throw Error('Page did not load');};
const metrics=async(width,height=900,mobile=false)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await wait(60);};
const allEnhanced=`[...document.querySelectorAll('select')].filter(s=>!s.closest('[hidden][aria-hidden="true"]')).every(s=>s.classList.contains('dom-select-native')&&s.parentElement.querySelectorAll(':scope>.dom-select-button').length===1)`;
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.navigate',{url});await ready();
 await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');localStorage.setItem('planifica-tus-redes-v2',JSON.stringify({clients:[{id:'a',name:'A',description:'',color:'#8da995'},{id:'b',name:'B',description:'',color:'#8da995'}],accounts:[],items:['a','b'].flatMap(clientId=>['instagram','linkedin'].flatMap(platform=>['idea','preparation','ready','published'].map((status,i)=>({id:clientId+platform+status,title:clientId+platform+status,clientId,platform,status,caption:'',type:'post',date:'2025-01-0'+(4-i),updatedAt:'2025-01-01'})))).concat([{id:'undated',title:'Undated',caption:'',type:'post',status:'idea',date:null,clientId:'a',platform:'instagram',updatedAt:'2025-01-01'}])}));location.reload()`);await wait(200);await ready();
 await metrics(1440);await click('#desktop-nav [data-page=progress]');
 const stored=await evaluate('JSON.stringify(localStorage)');
 await check('Publicaciones heading',`document.querySelectorAll('.progress-panel h2')[1].textContent==='Publicaciones'`);
 for(const client of ['all','a','b'])for(const platform of ['all','instagram','linkedin']){
  await choose('filter-client',client);await choose('filter-platform',platform);
  const combinations=(client==='all'?2:1)*(platform==='all'?2:1);
  await check('Planned metric excludes published',`[...document.querySelectorAll('.metric')].find(e=>e.querySelector('.metric-label').textContent==='Planificadas').querySelector('.metric-value').textContent===${JSON.stringify(String(3*combinations))}`);
  const summary=await evaluate(`document.querySelector('#metrics').innerHTML+document.querySelector('.progress-panel').innerHTML`);
  for(const status of ['all','planned','pending','ready','published']){
   const beforeStorage=await evaluate('JSON.stringify(localStorage)');await choose('filter-status',status);if(beforeStorage!==await evaluate('JSON.stringify(localStorage)'))throw Error('Status changed storage');
   const expected=['a','b'].filter(c=>client==='all'||c===client).flatMap(c=>['instagram','linkedin'].filter(p=>platform==='all'||p===platform).flatMap(p=>['idea','preparation','ready','published'].filter(s=>status==='all'||(status==='planned'?['idea','preparation','ready'].includes(s):status==='pending'?['idea','preparation'].includes(s):status===s)).map(s=>c+p+s))).sort();
   const actual=(await evaluate(`(()=>{const out=[],q=s=>document.querySelector(s),take=()=>out.push(...[...document.querySelectorAll('.next-item .post-title')].map(e=>e.textContent)),go=d=>{while(q('[data-dir='+d+']')&&!q('[data-dir='+d+']').disabled)q('[data-dir='+d+']').click()};go('prev');take();while(q('[data-dir=next]')&&!q('[data-dir=next]').disabled){q('[data-dir=next]').click();take()}go('prev');return out})()`)).sort();
   if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error(JSON.stringify({expected,actual}));
   if(summary!==await evaluate(`document.querySelector('#metrics').innerHTML+document.querySelector('.progress-panel').innerHTML`))throw Error('Summary changed');
   await check('Chronological dates',`(()=>{const d=[...document.querySelectorAll('.date-badge strong')].map(e=>+e.textContent);return d.every((v,i)=>!i||v>=d[i-1]);})()`);
  }
 }
 await choose('filter-platform','youtube');
 await check('Empty message',`document.querySelector('.progress-panel:last-child .empty-small').textContent.includes('No hay publicaciones que coincidan con los filtros seleccionados.')`);
 await click('[data-action=clear-filters]');
 await check('Clear filters',`document.querySelector('#filter-status').value==='all'&&(()=>{const out=[],q=s=>document.querySelector(s),take=()=>out.push(...[...document.querySelectorAll('.next-item .post-title')].map(e=>e.textContent)),go=d=>{while(q('[data-dir='+d+']')&&!q('[data-dir='+d+']').disabled)q('[data-dir='+d+']').click()};go('prev');take();while(q('[data-dir=next]')&&!q('[data-dir=next]').disabled){q('[data-dir=next]').click();take()}go('prev');return out})().length===16`);
 for(const width of [1440,393,320]){
  await metrics(width,900,width<500);await choose('filter-status','planned');await choose('filter-status','all');
  await click('#filter-status-combobox');
  await check('Dropdown fits viewport '+width,`(()=>{const r=document.querySelector('.dom-select-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth;})()`);
  await key('Escape');
  await check('Filter heights match '+width,`new Set(['client','platform','status'].map(id=>document.querySelector('#filter-'+id+'-combobox').getBoundingClientRect().height)).size===1`);
 }
 await choose('filter-status','published');await click('.next-item [data-action=edit]');
 await check('Published edit works',`document.querySelector('#item-status').value==='published'`);

 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('OK 45 filter combinations, unchanged statistics/storage, edit, desktop/mobile and no CSP/JS errors');
}finally{
 ws.close();proc.kill();server.close();await new Promise(ok=>proc.exitCode!==null?ok():proc.once('exit',ok));
 if(!resolve(profile).startsWith(resolve(tmpdir())+sep)||!basename(profile).startsWith('planifica-selects-'))throw Error('Unexpected test profile path');
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}





