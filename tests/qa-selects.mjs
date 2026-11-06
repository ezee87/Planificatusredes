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
 await metrics(1440);
 await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');localStorage.setItem('planifica-tus-redes-v2',JSON.stringify({clients:[{id:'client-a',name:'Cliente A',description:'',color:'#8da995'}],accounts:[{id:'a-ig',clientId:'client-a',platform:'instagram',username:'@cliente'},{id:'a-li',clientId:'client-a',platform:'linkedin',username:'empresa'}],items:[]}));location.reload()`);await wait(200);await ready();
 await check('Existing controls enhanced once, metadata templates untouched',allEnhanced+`&&[...document.querySelectorAll('div[hidden][aria-hidden=true] select')].every(s=>!s.classList.contains('dom-select-native'))`);
 await click('[data-action=new-post]');await fill('item-title','DOM select publication');
 await choose('item-type','carrusel');await choose('item-status','ready');await choose('item-client','client-a');
 // Account and network selects were replaced by the multi-network chips (qa-multirred-importacion.mjs covers them in depth).
 await check('Client accounts shown as network chips',`[...document.querySelectorAll('#item-networks > .network-chips input')].map(i=>i.value).join()==='a:a-ig,a:a-li'&&document.querySelector('#item-networks input[value="a:a-ig"]').checked`);
 await click('label.network-chip:has(input[value="a:a-li"])');await click('label.network-chip:has(input[value="a:a-li"])');
 await click('#modal-submit');
 const publication=await evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.find(x=>x.title==='DOM select publication')`);
 if(!publication||publication.type!=='carrusel'||publication.status!=='ready'||publication.clientId!=='client-a'||publication.accountId!=='a-ig'||publication.platform!=='instagram')throw Error('Stored publication values changed');
 console.log('OK publication stored original values');
 await click('[data-action=edit][data-id="'+publication.id+'"]');
 await check('Edit reflects stored values',`document.querySelector('#item-type-combobox').textContent==='Carrusel'&&document.querySelector('#item-status-combobox').textContent==='Listo'`);
 await choose('item-status','published');await click('#modal-submit');
 await check('State update saved',`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.find(x=>x.id===${JSON.stringify(publication.id)}).status==='published'`);
 await choose('filter-client','client-a');await check('Filter rerender restores combobox focus',`document.activeElement.id==='filter-client-combobox'`);
 await choose('filter-platform','instagram');await choose('filter-client','all');await choose('filter-platform','all');
 await click('#desktop-nav [data-page=ideas]');await click('[data-action=new-idea]');await fill('item-title','DOM select idea');await choose('item-type','historia');await click('label.network-chip:has(input[value="p:youtube"])');await click('label.network-chip:has(input[value="p:instagram"])');await choose('item-status','preparation');await click('#modal-submit');
 await click('#desktop-nav [data-page=ideas]');
 const idea=await evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.find(x=>x.title==='DOM select idea')`);
 if(!idea||idea.date!==null||idea.type!=='historia'||idea.platform!=='youtube'||idea.status!=='preparation')throw Error('Idea data mismatch');
 await click('[data-action=edit][data-id="'+idea.id+'"]');await choose('item-type','video');await click('#modal-submit');
 await check('Idea edit saved with null date',`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.some(x=>x.id===${JSON.stringify(idea.id)}&&x.type==='video'&&x.date===null)`);
 await click('#desktop-nav [data-page=calendar]');
 // Every content-field dropdown, with real mouse hit testing, at both viewport sizes.
 for(const [width,height,mobile] of [[1440,900,false],[393,852,true],[320,568,true]]){
  await metrics(width,height,mobile);await click('[data-action=new-post]');
  for(const id of ['item-client','item-type','item-status']){
   if(!await evaluate(`document.querySelector('#${id}-combobox').getClientRects().length>0`))continue;
   await click('#'+id+'-combobox');
   await check(id+' DOM panel visible without clipping at '+width,`(()=>{const p=document.querySelector('.dom-select-panel');if(!p||!p.matches(':popover-open'))return false;const r=p.getBoundingClientRect(),v=visualViewport;const x=r.x+r.width/2,y=r.y+Math.min(r.height/2,24);return r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height+1&&p.contains(document.elementFromPoint(x,y))&&p.querySelectorAll('[role=option]').length===document.querySelector('#${id}').options.length;})()`);
   if(id==='item-status'&&width===393){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'planifica-selects-mobile.png'),Buffer.from(shot.data,'base64'));}
   await key('Escape');await check('Escape only closes dropdown, not modal',`!document.querySelector('.dom-select-panel')&&document.querySelector('#modal-overlay').classList.contains('open')&&document.activeElement.id==='${id}-combobox'`);
  }
  if(width===393){await send('Emulation.setTouchEmulationEnabled',{enabled:true});await touch('#item-type-combobox');await touch('.dom-select-panel [data-index="2"]');await check('Touch selects Carrusel',`document.querySelector('#item-type').value==='carrusel'&&!document.querySelector('.dom-select-panel')`);await send('Emulation.setTouchEmulationEnabled',{enabled:false});}
  await click('#item-type-combobox');await key('Home');await key('ArrowDown');await key('Enter');await check('Keyboard Enter selects Reel',`document.querySelector('#item-type').value==='reel'`);
  await click('#item-type-combobox');await key('End');await key(' ');await check('Keyboard Space selects Otro',`document.querySelector('#item-type').value==='otro'`);
  await click('#item-type-combobox');await key('c');await key('Enter');await check('Typeahead selects Carrusel',`document.querySelector('#item-type').value==='carrusel'`);
  await click('#item-type-combobox');await key('Tab');await check('Tab closes and advances focus',`!document.querySelector('.dom-select-panel')&&document.activeElement.id!=='item-type-combobox'&&document.querySelector('.modal').contains(document.activeElement)`);
  await click('#item-type-combobox');await click('#item-title');await check('Outside click closes',`!document.querySelector('.dom-select-panel')`);
  await click('#modal-close-icon');
 }
 // Native dialog integration (above the browser's top layer, within its DOM).
 await metrics(393,852,true);await click('#mobile-nav [data-page=clients]');await click('[data-action=account-new][data-id=client-a]');
 await choose('account-platform','linkedin');await fill('account-username','new-account');await click('#manager-form [type=submit]');
 await check('Account FormData submitted unchanged',`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).accounts.some(x=>x.username==='new-account'&&x.platform==='linkedin'&&x.clientId==='client-a')`);
 await click('[data-action=account-delete][data-id=a-ig]');await click('#account-transfer-combobox');
 await check('Dropdown stays interactive inside native dialog',`(()=>{const p=document.querySelector('.dom-select-panel'),r=p.getBoundingClientRect();return !!p.closest('dialog:modal')&&p.contains(document.elementFromPoint(r.x+r.width/2,r.y+20));})()`);
 await key('Escape');await check('Escape preserves native dialog',`document.querySelector('#manager-dialog').open&&!document.querySelector('.dom-select-panel')`);await click('#manager-cancel');
 await click('[data-action=client-delete][data-id=client-a]');await choose('client-transfer','transfer');await click('#manager-cancel');
 await click('#mobile-nav [data-page=calendar]');await click('[data-action=mode][data-mode=week]');
 await click('[data-action=mobile-move][data-id="'+publication.id+'"]');
 const moveDate=await evaluate(`[...document.querySelector('#mobile-move-date').options].find(o=>o.value!==${JSON.stringify(publication.date)}).value`);
 await choose('mobile-move-date',moveDate);await click('#manager-form [type=submit]');
 await check('Move-publication selector preserves existing submission',`JSON.parse(localStorage.getItem('planifica-tus-redes-v2')).items.some(x=>x.id===${JSON.stringify(publication.id)}&&x.date===${JSON.stringify(moveDate)}&&x.status==='published')`);
 // Dynamic source compatibility: mutation, direct setters, disabled options,
 // duplicate values (selection by index), optgroups, form reset and validation.
 await evaluate(`const f=document.createElement('form');f.id='select-fixture';f.innerHTML='<label for="test-select">Selector de prueba</label><select id="test-select" name="fixture" required><option value="">Elegir</option><option value="same">Primera</option><option value="same">Segunda</option><optgroup label="Grupo" disabled><option value="blocked">Bloqueada</option></optgroup><option value="last">Final</option></select><button type="submit">Enviar</button>';document.querySelector('main').append(f);`);await wait(30);
 await check('Newly inserted select enhanced and label preserved',`document.querySelector('#test-select-combobox').getAttribute('aria-labelledby')==='test-select-combobox-label'&&document.querySelector('#test-select-combobox-label').textContent==='Selector de prueba'`);
 await evaluate(`document.querySelector('#test-select').selectedIndex=2`);await check('Duplicate values preserve selected index and text',`document.querySelector('#test-select-combobox').textContent==='Segunda'`);
 await evaluate(`document.querySelector('#test-select').options[1].selected=true`);await check('Option.selected property syncs',`document.querySelector('#test-select-combobox').textContent==='Primera'`);
 await evaluate(`document.querySelector('#test-select').value='last'`);await check('Value property syncs without an event',`document.querySelector('#test-select-combobox').textContent==='Final'`);
 await click('#test-select-combobox');await key('Home');await key('ArrowDown');await key('ArrowDown');await key('ArrowDown');await key('Enter');
 await check('Keyboard skips disabled group',`document.querySelector('#test-select').value==='last'`);
 await click('#test-select-combobox');await click('.dom-select-panel [data-index="3"]');await check('Pointer cannot select disabled option',`document.querySelector('#test-select').value==='last'&&!!document.querySelector('.dom-select-panel')`);await key('Escape');
 await click('#test-select-combobox');await evaluate(`[...document.querySelector('#test-select').options].forEach(o=>o.disabled=true)`);await wait(30);await key('Enter');await check('All disabled options cannot change selection',`document.querySelector('#test-select').value==='last'`);await key('Escape');
 await evaluate(`document.querySelector('#test-select').innerHTML='<option value="a">Nueva A</option><option value="b" selected>Nueva B</option>'`);await wait(30);
 await check('Options replacement synchronized once',`document.querySelector('#test-select-combobox').textContent==='Nueva B'&&document.querySelectorAll('#test-select-combobox').length===1`);
 await evaluate(`document.querySelector('#test-select').value='a';document.querySelector('#select-fixture').reset()`);await wait(30);await check('Native form reset synchronizes value',`document.querySelector('#test-select').value==='b'&&document.querySelector('#test-select-combobox').textContent==='Nueva B'`);
 await evaluate(`document.querySelector('#test-select').disabled=true`);await wait(20);await check('Disabled control mirrored',`document.querySelector('#test-select-combobox').disabled`);
 await evaluate(`const s=document.querySelector('#test-select');s.disabled=false;s.innerHTML='<option value="">Elegir</option><option value="valid">Válida</option>';s.form.reportValidity()`);await wait(30);
 await check('Required validity and accessible error kept',`!document.querySelector('#test-select').validity.valid&&document.activeElement.id==='test-select-combobox'&&document.querySelector('#test-select-combobox').getAttribute('aria-invalid')==='true'&&!document.querySelector('#test-select-combobox-error').hidden`);
 await choose('test-select','valid');await check('FormData uses original name and value',`new FormData(document.querySelector('#select-fixture')).get('fixture')==='valid'&&document.querySelector('#test-select').validity.valid&&document.querySelector('#test-select-combobox-error').hidden`);
 await evaluate(`const earlier=document.createElement('input');earlier.id='earlier-invalid';earlier.required=true;document.querySelector('#select-fixture').prepend(earlier);document.querySelector('#test-select').value='';document.querySelector('#select-fixture').reportValidity()`);await wait(20);
 await check('Earlier invalid native input keeps validation focus',`document.activeElement.id==='earlier-invalid'`);
 await evaluate(`document.querySelector('#select-fixture').remove()`);
 // Support and claim forms: choose real text values and intercept POST locally.
 await click('.mobile-help');await click('[data-support-open=support]');await fill('support-email','qa@example.com');await fill('support-description','Consulta de prueba');await choose('support-reason','Problema técnico');await click('#support-form-panel [type=submit]');await wait(50);
 if(!posts.some(body=>new URLSearchParams(body).get('motivo')==='Problema técnico'))throw Error('Support FormData mismatch');console.log('OK support submit keeps original option text');
 await check('Support reset updates custom control',`document.querySelector('#support-reason').value===''&&document.querySelector('#support-reason-combobox').textContent==='Seleccioná una opción'`);
 await click('#support-form-panel [data-support-close]');await click('[data-support-open=claim]');await fill('claim-email','qa@example.com');await choose('claim-type','Solicitar reembolso');await click('#claim-form-panel [type=submit]');await wait(50);
 if(!posts.some(body=>new URLSearchParams(body).get('tipo')==='Solicitar reembolso'))throw Error('Claim FormData mismatch');console.log('OK claim submit keeps original option text');
 // Onboarding is rendered dynamically and has its own focus trap.
 await evaluate(`localStorage.removeItem('planifica-tus-redes-tutorial-v1');location.reload()`);await wait(180);await ready();
 await click('[data-entry=next]');await click('[data-path=clients]');await click('[data-entry=next]');
 await choose('entry-client-existing','client-a');await click('[data-entry=next]');
 await choose('entry-platform-0','tiktok');await check('Onboarding select inside entry DOM',`!!document.querySelector('#entry-screen #entry-platform-0-combobox')&&document.querySelector('#entry-platform-0').value==='tiktok'`);
 await check('All dynamic selects enhanced once',allEnhanced);
 const ax=await send('Accessibility.getFullAXTree');
 if(!ax.nodes.some(n=>!n.ignored&&n.role?.value==='combobox'&&n.name?.value==='Red social'))throw Error('Combobox accessible name missing');
 console.log('OK accessible combobox names exposed');
 if(errors.length)throw Error(JSON.stringify(errors));console.log('OK no JavaScript or CSP errors');console.log('Screenshot: '+join(tmpdir(),'planifica-selects-mobile.png'));
}finally{
 ws.close();proc.kill();server.close();await new Promise(ok=>proc.exitCode!==null?ok():proc.once('exit',ok));
 if(!resolve(profile).startsWith(resolve(tmpdir())+sep)||!basename(profile).startsWith('planifica-selects-'))throw Error('Unexpected test profile path');
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
