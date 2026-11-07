// Content links and posts-only export/import. Uses an isolated, temporary Chrome profile
// and a local server with the real CSP: it never touches real browser data or external services.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm,readdir,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve,basename,sep} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'planifica-enlaces-'));
const csp=(await readFile(join(root,'_headers'),'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','commercial.js','commercial.css','custom-selects.js','custom-selects.css','bonos-data.js','bonos.js','bonos.css','favicon.svg','fonts/inter-latin-wght.woff2'].includes(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8','Content-Security-Policy':csp});res.end(await readFile(join(root,file)));
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

const seed={clients:[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'marca',name:'Marca',description:'',color:'#a79bb6'},{id:'destino',name:'Destino',description:'',color:'#bd9c8b'}],
  accounts:[{id:'ig1',clientId:'marca',platform:'instagram',username:'@Principal'},{id:'ig2',clientId:'marca',platform:'instagram',username:'@Secundaria'},{id:'tt',clientId:'marca',platform:'tiktok',username:'@Marca'},
    {id:'dig1',clientId:'destino',platform:'instagram',username:'principal'},{id:'dig2',clientId:'destino',platform:'instagram',username:'secundaria'},{id:'dtt',clientId:'destino',platform:'tiktok',username:'marca'}],
  items:['idea','preparation','ready','published'].map((status,i)=>({id:'old-'+i,importId:'imported-'+i,title:'Anterior '+status,caption:'  Guion\n\nTexto íntegro 🎬  ',platform:'instagram',accountId:i===1?'ig2':'ig1',clientId:'marca',type:'reel',status,date:i?today:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}))};
const downloads=join(profile,'downloads');await mkdir(downloads);
const downloaded=async prefix=>{for(let i=0;i<100;i++){const name=(await readdir(downloads)).find(x=>x.startsWith(prefix)&&x.endsWith('.json'));if(name)return {path:join(downloads,name),data:JSON.parse(await readFile(join(downloads,name),'utf8'))};await wait(50);}throw Error('Download missing: '+prefix);};
const openEdit=id=>evaluate(`document.querySelector('[data-action=edit][data-id="'+${JSON.stringify(id)}+'"]').click()`);
const screenshot=async name=>{const dir=join(root,'tests','visual-enlaces-exportacion');await mkdir(dir,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(dir,name+'.png'),Buffer.from(r.data,'base64'));};
try{
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('DOM.enable');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});await ready();
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(seed))});location.reload()`);await wait(250);await ready();
  assert('Old items load without a link',(await stored()).items.every(x=>!Object.hasOwn(x,'contentUrl')));
  await check('No link icons for old items',`document.querySelectorAll('[data-action=view-content]').length===0`);

  await click('[data-action=new-post]');await fill('item-title','Sin enlace');await setSelect('item-client','marca');await click('#modal-submit');
  const without=(await stored()).items.find(x=>x.title==='Sin enlace');assert('Create without link',without&&!Object.hasOwn(without,'contentUrl'));
  await click('[data-action=new-post]');await fill('item-title','Con enlace');await setSelect('item-client','marca');await click('label.network-chip:has(input[value="a:tt"])');
  await check('URL field optional and labelled',`document.getElementById('item-content-url').type==='url'&&!document.getElementById('item-content-url').required&&document.querySelector('label[for=item-content-url]').textContent==='Enlace al contenido'`);
  for(const invalid of ['no es url','javascript:alert(1)','data:text/html,contenido','ftp://example.com/file']){
    await fill('item-content-url',invalid);const before=await rawStored();await click('#modal-submit');assert('Reject unsafe or malformed URL '+invalid,before===await rawStored());
  }
  const material=url+'?material=1';await fill('item-content-url',material);await fill('item-text','  Texto exacto\n\nSegunda línea 🎬  ');await setSelect('item-status','ready');await click('#modal-submit');
  const linked=(await stored()).items.find(x=>x.title==='Con enlace');assert('Create linked multi-network publication',linked?.contentUrl===material&&linked.networks.length===2);
  await check('Secure accessible link on day card',`(()=>{const c=[...document.querySelectorAll('#selected-day .post-card')].find(c=>c.textContent.includes('Con enlace'));const a=c.querySelector('a[data-action=view-content]');return a.href===${JSON.stringify(material)}&&a.target==='_blank'&&a.rel==='noopener noreferrer'&&a.title==='Ver contenido'&&a.getAttribute('aria-label')==='Ver contenido';})()`);
  await check('No icon on unlinked card',`![...document.querySelectorAll('#selected-day .post-card')].find(c=>c.textContent.includes('Sin enlace')).querySelector('[data-action=view-content]')`);
  await click('#selected-day a[data-action=view-content]');await wait(200);
  const targets=(await send('Target.getTargets')).targetInfos,popup=targets.find(t=>t.type==='page'&&t.url===material);assert('Link opens new tab',!!popup);
  const popupWS=new WebSocket(popup.webSocketDebuggerUrl||`ws://127.0.0.1:${port}/devtools/page/${popup.targetId}`);await new Promise(ok=>popupWS.onopen=ok);
  const noOpener=await new Promise(ok=>{popupWS.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1)ok(m.result?.result?.value);};popupWS.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'window.opener===null',returnByValue:true}}));});popupWS.close();assert('New tab has no opener',noOpener);await send('Target.closeTarget',{targetId:popup.targetId});
  await openEdit(linked.id);await check('Link available in calendar detail',`document.querySelector('#modal-content-link a').href===${JSON.stringify(material)}`);
  for(const address of ['https://drive.google.com/file/d/test/view','https://www.dropbox.com/s/test/file','https://onedrive.live.com/?id=test','https://example.com/file?a=1&b="texto"']){
    await fill('item-content-url',address);await click('#modal-submit');assert('Edit supports '+address,(await stored()).items.find(x=>x.id===linked.id).contentUrl===address);await openEdit(linked.id);
  }
  await fill('item-content-url','');await click('#modal-submit');assert('Remove link',(await stored()).items.find(x=>x.id===linked.id).contentUrl===undefined);
  await check('Removed link removes icon',`document.querySelectorAll('#selected-day [data-action=view-content]').length===0`);
  await openEdit(linked.id);await fill('item-content-url',material);await click('#modal-submit');
  const persisted=(await stored()).items;await evaluate('location.reload()');await wait(250);await ready();assert('Reload keeps all publication data',canon((await stored()).items)===canon(persisted));

  await click('.sidebar .backup-btn[data-action=export]');const full=await downloaded('planifica-tus-redes-respaldo-');
  assert('Full backup contains link',full.data.items.find(x=>x.id===linked.id).contentUrl===material);
  await setFile('#import-file',full.path);assert('Full restore keeps all fields',canon((await stored()).items)===canon(persisted));
  await setSelect('filter-platform','facebook');
  const beforePartial=await rawStored();await click('.sidebar .backup-btn[data-action=export-posts]');await setSelect('export-client','marca');await click('#manager-form [type=submit]');
  const partial=await downloaded('planifica-tus-redes-publicaciones-Marca-');assert('Export does not write storage',beforePartial===await rawStored());
  assert('Existing version 1 format only',partial.data.format==='planifica-tus-redes-publicaciones'&&partial.data.version===1&&Object.keys(partial.data).sort().join()==='format,items,version');
  assert('Export includes only selected client content',partial.data.items.length===persisted.filter(x=>x.clientId==='marca').length);
  await setSelect('filter-platform','all');
  assert('Export preserves native ID and link',partial.data.items.find(x=>x.importId===linked.id)?.contentUrl===material);
  assert('Export identifies same-platform accounts',partial.data.items.find(x=>x.importId==='imported-1').networks[0].username==='@Secundaria');
  await openPostsImport('marca');await setFile('#import-posts-file',partial.path);await check('Reimport to source skips native and imported items',`document.querySelector('#import-preview').textContent.includes('No hay nada nuevo para agregar')&&document.querySelector('#manager-form [type=submit]').disabled`);await closeDialog();
  await openPostsImport('destino');await setFile('#import-posts-file',partial.path);await check('Existing partial importer accepts export',`!document.querySelector('#manager-form [type=submit]').disabled`);await click('#manager-form [type=submit]');
  const imported=(await stored()).items.filter(x=>x.clientId==='destino');assert('Import count correct',imported.length===partial.data.items.length);
  for(const row of partial.data.items){const x=imported.find(x=>x.importId===row.importId);assert('Round trip fields '+row.importId,['title','caption','type','status','date','contentUrl'].every(k=>x[k]===row[k]));
    const expected=row.networks.map(n=>seed.accounts.find(a=>a.clientId==='destino'&&a.platform===n.platform&&a.username.replace(/^@/,'').toLowerCase()===n.username.replace(/^@/,'').toLowerCase()).id);assert('Round trip accounts '+row.importId,canon(x.networks.map(n=>n.accountId))===canon(expected));}
  const afterImport=await rawStored();await openPostsImport('destino');await setFile('#import-posts-file',partial.path);await check('Repeated import skips duplicates',`document.querySelector('#import-preview').textContent.includes('No hay nada nuevo para agregar')`);await closeDialog();assert('No duplicates or mutations',await rawStored()===afterImport);
  const unsafe=structuredClone(partial.data);unsafe.items[0].contentUrl='javascript:alert(1)';await openPostsImport('destino');await setFile('#import-posts-file',await tmpJSON('unsafe.json',unsafe));await check('Partial importer rejects unsafe links',`document.querySelector('#manager-form [type=submit]').disabled&&document.querySelector('.import-errors').textContent.includes('contentUrl')`);await closeDialog();assert('Invalid import keeps data',await rawStored()===afterImport);

  for(const width of [1440,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<790});
    await evaluate(`document.querySelector('#desktop-nav [data-page=calendar]').click()`);await setSelect('filter-client','marca');
    for(const mode of ['month','week']){
      await evaluate(`document.querySelector('[data-action=mode][data-mode=${mode}]').click()`);await wait(80);
      const panel=width>790?'#selected-day':'#mobile-selected-day';await check(`Calendar link ${mode} ${width}`,`!!document.querySelector('${panel} [data-action=view-content]')`);
      await evaluate(`document.querySelector('${panel}').scrollIntoView({block:'center',behavior:'instant'})`);await screenshot(`calendario-${mode}-${width}`);
      await check(`No horizontal overflow ${mode} ${width}`,`document.documentElement.scrollWidth<=innerWidth+1`);
      await check(`All card actions fit ${mode} ${width}`,`[...document.querySelectorAll('${panel} .post-card')].every(c=>{const r=c.getBoundingClientRect();return [...c.querySelectorAll('.post-actions > *')].every(e=>{const a=e.getBoundingClientRect();return a.left>=r.left&&a.right<=r.right&&a.top>=r.top&&a.bottom<=r.bottom;});})`);
    }
    await openEdit(linked.id);await evaluate(`document.getElementById('item-content-url').scrollIntoView({block:'center',behavior:'instant'})`);await screenshot('formulario-'+width);
    await check('URL field fits '+width,`(()=>{const r=document.getElementById('item-content-url').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth;})()`);await evaluate(`document.querySelector('[data-action=close-modal]').click()`);
    if(width>790)await click('.sidebar .backup-btn[data-action=export-posts]');else{await click('#mobile-backup-icon');await check('Mobile export option visible '+width,`document.querySelector('#mobile-backup-menu [data-action=export-posts]').checkVisibility()`);await screenshot('menu-'+width);await click('#mobile-backup-menu [data-action=export-posts]');}
    await screenshot('exportar-'+width);await check('Export selector accessible '+width,`document.getElementById('manager-dialog').open&&!!document.querySelector('label[for=export-client]')`);await closeDialog();
    await evaluate(`document.querySelector('#desktop-nav [data-page=ideas]').click()`);await check('Ideas still displayed '+width,`document.querySelector('.idea-grid').textContent.includes('Anterior idea')`);
    await evaluate(`document.querySelector('#desktop-nav [data-page=progress]').click()`);await check('Progress still displayed '+width,`document.querySelector('.next-list').textContent.includes('Con enlace')`);
  }
  // Export must not count the outgoing rows as incoming rows against local capacity.
  const many={...seed,items:Array.from({length:5001},(_,i)=>({...seed.items[1],id:'large-'+i,importId:'large-'+i,date:null}))};
  await evaluate(`localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(many))});location.reload()`);await wait(250);await ready();
  const beforeLarge=await rawStored();await evaluate(`document.querySelector('.sidebar .backup-btn[data-action=export-posts]').click()`);await setSelect('export-client','marca');await click('#manager-form [type=submit]');
  const files=(await readdir(downloads)).filter(n=>n.startsWith('planifica-tus-redes-publicaciones-Marca-')&&n.endsWith('.json'));
  let large;for(const file of files){const data=JSON.parse(await readFile(join(downloads,file),'utf8'));if(data.items.length===5001)large=data;}
  assert('Export beyond half of local capacity succeeds',large?.items.length===5001);assert('Large export keeps storage unchanged',beforeLarge===await rawStored());
  await evaluate(`document.querySelector('.sidebar .backup-btn[data-action=export-posts]').click()`);await setSelect('export-client','personal');const beforeEmptyFiles=(await readdir(downloads)).length;await click('#manager-form [type=submit]');
  await check('Empty client export shows a clear message',`document.getElementById('manager-dialog').open&&document.getElementById('toast').textContent.includes('no tiene publicaciones')`);assert('Empty client downloads nothing',(await readdir(downloads)).length===beforeEmptyFiles);await closeDialog();
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log(`OK ${passed} checks: links, safe new tab, reload, full backups, posts export/import, references, duplicate prevention, desktop/mobile, no JS/CSP errors`);
}finally{
  ws.close();proc.kill();server.close();await new Promise(ok=>proc.exitCode!==null?ok():proc.once('exit',ok));
  if(!resolve(profile).startsWith(resolve(tmpdir())+sep)||!basename(profile).startsWith('planifica-enlaces-'))throw Error('Unexpected test profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
