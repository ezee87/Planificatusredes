// Expandable caption editor in the content modal. Uses an isolated, temporary Chrome profile and a
// local server with the real CSP: it never touches real browser data or external services.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve,basename,sep} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'planifica-editor-'));
const csp=(await readFile(join(root,'_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','commercial.js','commercial.css','custom-selects.js','custom-selects.css','bonos-data.js','bonos.js','bonos.css','favicon.svg'].includes(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8','Content-Security-Policy':csp});res.end(await readFile(join(root,file)));
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
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);if(m.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
let passed=0;
const check=async(name,expression)=>{if(!await evaluate(expression))throw Error('FAILED: '+name);passed++;console.log('OK '+name);};
const assert=(name,value)=>{if(!value)throw Error('FAILED: '+name);passed++;console.log('OK '+name);};
const click=async selector=>{
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await wait(40);
};
const setSelect=async(id,value)=>{await evaluate(`(()=>{const s=document.getElementById(${JSON.stringify(id)});if(![...s.options].some(o=>o.value===${JSON.stringify(value)}))throw Error('Missing option');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(60);};
const fill=async(id,text)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
// Key-order independent comparison: normalization may rebuild objects with another key order.
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x);
const stored=()=>evaluate(`JSON.parse(localStorage.getItem('planifica-tus-redes-v2'))`);
const rawStored=()=>evaluate(`localStorage.getItem('planifica-tus-redes-v2')`);
const ready=async()=>{for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&!!window.PlanificaSelects`))return;await wait(50);}throw Error('Page did not load');};
const setFile=async(selector,path)=>{const {result}=await send('Runtime.evaluate',{expression:`document.querySelector(${JSON.stringify(selector)})`});await send('DOM.setFileInputFiles',{files:[path],objectId:result.objectId});await wait(250);};
const tmpJSON=async(name,data)=>{const path=join(profile,name);await writeFile(path,typeof data==='string'?data:JSON.stringify(data,null,2));return path;};
const openPostsImport=async(clientId)=>{await click('.sidebar .backup-btn[data-action=import]');await check('Import dialog open',`document.getElementById('manager-dialog').open&&document.getElementById('manager-title').textContent==='Importar datos'`);await click('input[name=mode][value=posts]');await setSelect('import-client',clientId);};
const closeDialog=()=>evaluate(`document.getElementById('manager-dialog').close()`);
const preview=()=>evaluate(`Object.fromEntries([...document.querySelectorAll('.import-summary dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent]))`);
const today=await (async()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();

const key=async(k)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k,windowsVirtualKeyCode:k==='Escape'?27:0});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k,windowsVirtualKeyCode:k==='Escape'?27:0});await wait(60);};
const metrics=async(width,height,mobile)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await wait(150);};
const shotsDir=process.env.EDITOR_SHOTS;
const shot=async name=>{if(!shotsDir)return;await wait(150);const x=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(shotsDir,'editor-'+name+'.png'),Buffer.from(x.data,'base64'));};
const isOpen=`document.getElementById('modal-overlay').classList.contains('open')`;
const isExpanded=`document.querySelector('#modal-overlay .modal').classList.contains('is-text-expanded')`;
const visible=id=>`(document.getElementById(${JSON.stringify(id)})?.getClientRects().length>0)`;
// Layout facts for the expanded editor at the current viewport.
const layout=()=>evaluate(`(()=>{const m=document.querySelector('#modal-overlay .modal').getBoundingClientRect(),t=document.getElementById('item-text').getBoundingClientRect(),s=document.getElementById('modal-submit').getBoundingClientRect(),b=document.getElementById('item-text-expand').getBoundingClientRect(),h=document.getElementById('modal-title').getBoundingClientRect(),v=visualViewport,d=document.querySelector('#modal-overlay .modal');
  const inside=r=>r.width>0&&r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1;
  return {ratio:t.height/m.height,textHeight:t.height,modalHeight:m.height,viewport:v.height,submit:inside(s),button:inside(b),title:inside(h),text:inside(t),noOverflowX:document.documentElement.scrollWidth<=innerWidth&&d.scrollWidth<=d.clientWidth+1&&t.right<=m.right+1};})()`);
const longCaption=Array.from({length:300},(_,i)=>`Línea ${i+1} del guion — «texto», saltos y espacios   conservados.`).join('\n').slice(0,19000)+'\n\nINSTRUCCIONES DE GRABACIÓN\n- Plano medio.';
const seed={clients:[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'pr',name:'Planifica tus redes',description:'',color:'#a79bb6'}],accounts:[{id:'ig',clientId:'pr',platform:'instagram',username:'@planificatusredes'}],
  items:[{id:'largo',title:'Guion largo',caption:longCaption,platform:'instagram',type:'reel',status:'idea',date:null,clientId:'pr',accountId:'ig',networks:[{platform:'instagram',accountId:'ig'}],createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'}]};
try{
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
  await metrics(1440,900,false);
  await send('Page.navigate',{url});await ready();
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(seed))});location.reload()`);await wait(250);await ready();

  // 1. Create: normal size, then expand.
  await click('[data-action=new-post]');
  await check('Taller textarea in normal mode',`document.getElementById('item-text').getBoundingClientRect().height>=135&&document.getElementById('item-text').maxLength===20000`);
  await check('Expand button accessible',`(()=>{const b=document.getElementById('item-text-expand');return b.getAttribute('aria-label')==='Ampliar el editor de texto'&&b.getAttribute('aria-pressed')==='false'&&b.getAttribute('aria-controls')==='item-text'&&!!b.querySelector('svg')})()`);
  await fill('item-title','Publicación con editor');await setSelect('item-type','reel');
  await click('#item-text-expand');
  await check('Expanded: other fields hidden, header and footer visible',`${isExpanded}&&!${visible('item-title')}&&!${visible('item-networks')}&&!${visible('item-date')}&&${visible('modal-title')}&&${visible('modal-submit')}&&${visible('item-text')}`);
  await check('Collapse button state, focus kept on it',`(()=>{const b=document.getElementById('item-text-expand');return b.getAttribute('aria-pressed')==='true'&&b.getAttribute('aria-label')==='Reducir el editor de texto'&&document.activeElement===b})()`);
  let l=await layout();assert('Desktop expanded fills modal ('+Math.round(l.ratio*100)+'%)',l.ratio>0.6&&l.submit&&l.button&&l.title&&l.noOverflowX);
  await shot('desktop-expandido');

  // 2-3. Type with line breaks, collapse: text and other fields preserved, nothing saved.
  const before=await rawStored();
  await evaluate(`document.getElementById('item-text').focus()`);
  const typed='GUION DE NARRACIÓN\nPrimera línea.\n\n  Línea con sangría.\nINSTRUCCIONES\n- Plano medio.';
  await send('Input.insertText',{text:typed});
  await key('Escape');
  await check('Escape collapses without closing the form',`${isOpen}&&!${isExpanded}&&${visible('item-title')}&&document.activeElement.id==='item-text'`);
  await check('Text and fields preserved after collapsing',`document.getElementById('item-text').value===${JSON.stringify(typed)}&&document.getElementById('item-title').value==='Publicación con editor'&&document.getElementById('item-type').value==='reel'`);
  assert('Collapsing does not save',before===await rawStored());

  // 4. Expand and save with the usual button.
  await click('#item-text-expand');await click('#modal-submit');
  let data=await stored();const created=data.items.find(x=>x.title==='Publicación con editor');
  assert('Saved from expanded mode with exact text',created&&created.caption===typed&&created.type==='reel');
  await check('Modal closed and reset after saving',`!${isOpen}&&!${isExpanded}`);

  // 5. Cancel without saving keeps the usual behavior (changes discarded, nothing stored).
  await click('[data-action=new-post]');
  await check('New modal opens collapsed',`!${isExpanded}&&document.getElementById('item-text-expand').getAttribute('aria-pressed')==='false'`);
  await fill('item-title','No guardar');await click('#item-text-expand');await fill('item-text','Borrador');
  const beforeCancel=await rawStored();
  await evaluate(`document.getElementById('modal-overlay').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);await wait(60);
  await check('Backdrop click while expanded only collapses',`${isOpen}&&!${isExpanded}&&document.getElementById('item-text').value==='Borrador'`);
  await click('#item-text-expand');await click('.modal-footer [data-action=close-modal]');
  await check('Cancelar closes as usual',`!${isOpen}`);
  assert('Cancel saved nothing',beforeCancel===await rawStored());

  // 6. Edit an existing long text: expand, scroll inside the editor, Escape twice.
  await click('#desktop-nav [data-page=ideas]');await click('[data-action=edit][data-id="largo"]');
  await check('Existing long caption loaded intact',`document.getElementById('item-text').value===${JSON.stringify(longCaption)}`);
  await click('#item-text-expand');
  await check('Long text scrolls inside the editor',`(()=>{const t=document.getElementById('item-text');return t.scrollHeight>t.clientHeight*3&&getComputedStyle(t).overflowY==='auto'})()`);
  const pageScroll=await evaluate('scrollY');
  const tp=await evaluate(`(()=>{const r=document.getElementById('item-text').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...tp,deltaX:0,deltaY:900});await wait(300);
  await check('Wheel scrolls the text, not the page',`document.getElementById('item-text').scrollTop>0&&scrollY===${pageScroll}`);
  await evaluate(`(()=>{const t=document.getElementById('item-text');t.focus();t.setSelectionRange(t.value.length,t.value.length);})()`);
  await send('Input.insertText',{text:'\n- Agregado al final.'});
  await shot('desktop-edicion-largo');
  await key('Escape');
  await check('First Escape collapses, keeps edit',`${isOpen}&&!${isExpanded}&&document.getElementById('item-text').value.endsWith('- Agregado al final.')`);
  await key('Escape');
  await check('Second Escape closes the modal as before',`!${isOpen}`);
  data=await stored();assert('Unsaved edit discarded as usual, stored text intact',data.items.find(x=>x.id==='largo').caption===longCaption);
  await click('[data-action=edit][data-id="largo"]');await click('#item-text-expand');
  await evaluate(`(()=>{const t=document.getElementById('item-text');t.focus();t.setSelectionRange(t.value.length,t.value.length);})()`);
  await send('Input.insertText',{text:'\nFinal guardado.'});await click('#modal-submit');
  data=await stored();assert('Long edit saved from expanded mode',data.items.find(x=>x.id==='largo').caption===longCaption+'\nFinal guardado.');

  // 7-8. Tablet and phones (also a short viewport, as with the virtual keyboard open).
  for(const [name,w,h] of [['tablet',820,1180],['movil',390,844],['movil-teclado',390,420],['movil-chico',320,568]]){
    await metrics(w,h,true);
    await evaluate(`document.querySelector('[data-action=edit][data-id="largo"]').click()`);await wait(150);
    await check(`Normal mode fits without horizontal overflow (${name})`,`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#modal-overlay .modal').scrollWidth<=document.querySelector('#modal-overlay .modal').clientWidth+1`);
    await click('#item-text-expand');
    l=await layout();
    assert(`Expanded layout ${name}: text ${Math.round(l.textHeight)}px of ${Math.round(l.viewport)}px, controls visible, no overflow`,l.submit&&l.button&&l.text&&l.noOverflowX&&l.textHeight>=(h<500?120:l.viewport*0.45));
    await shot(name+'-expandido');
    await click('#item-text-expand');
    await check(`Collapse restores the form (${name})`,`!${isExpanded}&&${visible('item-title')}&&document.activeElement.id==='item-text-expand'`);
    await evaluate(`document.querySelector('.modal-footer [data-action=close-modal]').click()`);await wait(80);
  }

  if(errors.length)throw Error(JSON.stringify(errors));
  console.log(`OK ${passed} checks: expandable caption editor on create/edit, preserved text, explicit save only, Escape/backdrop/cancel, long text scrolling, desktop/tablet/mobile without overflow or JS/CSP errors`);
}finally{
  ws.close();proc.kill();server.close();await new Promise(ok=>proc.exitCode!==null?ok():proc.once('exit',ok));
  if(!resolve(profile).startsWith(resolve(tmpdir())+sep)||!basename(profile).startsWith('planifica-editor-'))throw Error('Unexpected test profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
