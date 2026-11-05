// Multi-network content and posts-only JSON import. Uses an isolated, temporary Chrome profile
// and a local server with the real CSP: it never touches real browser data or external services.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve,basename,sep} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'planifica-multirred-'));
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

const seed={clients:[{id:'personal',name:'Personal',description:'',color:'#8da995'},{id:'pr',name:'Planifica tus redes',description:'',color:'#a79bb6'},{id:'otro',name:'Otro cliente',description:'',color:'#bd9c8b'}],
  accounts:[{id:'ig',clientId:'pr',platform:'instagram',username:'@planificatusredes'},{id:'tt',clientId:'pr',platform:'tiktok',username:'@planificatusredes'},{id:'fb',clientId:'otro',platform:'facebook',username:'otro'}],
  // Legacy single-network records exactly as previous versions stored them (no "networks").
  items:[{id:'old1',title:'Antigua Instagram',caption:'Texto viejo',platform:'instagram',type:'post',status:'ready',date:'2025-01-10',clientId:'pr',accountId:'ig',createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'},
    {id:'old2',title:'Antigua idea personal',caption:'',platform:'linkedin',type:'post',status:'idea',date:null,clientId:'personal',accountId:null,createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-02T00:00:00.000Z'},
    {id:'old3',title:'Antigua Facebook',caption:'Otro texto',platform:'facebook',type:'reel',status:'published',date:'2025-01-12',clientId:'otro',accountId:'fb',createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'}]};
try{
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});await ready();
  await evaluate(`localStorage.setItem('planifica-tus-redes-activated-v1','active');localStorage.setItem('planifica-tus-redes-tutorial-v1','done');localStorage.setItem('planifica-tus-redes-v2',${JSON.stringify(JSON.stringify(seed))});location.reload()`);await wait(250);await ready();

  // Compatibility: old records load unchanged and gain an equivalent single network.
  let data=await stored();
  for(const old of seed.items){
    const now=data.items.find(x=>x.id===old.id);
    assert('Legacy item intact '+old.id,now&&['title','caption','platform','type','status','date','clientId','accountId','createdAt','updatedAt'].every(k=>now[k]===old[k]));
    assert('Legacy item single network '+old.id,now.networks.length===1&&now.networks[0].platform===old.platform&&now.networks[0].accountId===old.accountId);
  }

  // Create with one network.
  await click('[data-action=new-post]');await fill('item-title','Una red');await setSelect('item-client','pr');
  await check('Picker shows only client accounts',`[...document.querySelectorAll('#item-networks > .network-chips input')].map(i=>i.value).join()==='a:ig,a:tt'`);
  await check('Default selects Instagram account',`document.querySelector('#item-networks input[value="a:ig"]').checked&&!document.querySelector('#item-networks input[value="a:tt"]').checked`);
  await click('#modal-submit');
  data=await stored();const one=data.items.find(x=>x.title==='Una red');
  assert('One-network item stored',one&&one.networks.length===1&&one.networks[0].accountId==='ig'&&one.platform==='instagram'&&one.accountId==='ig'&&one.date===today);

  // Create with two networks.
  await click('[data-action=new-post]');await fill('item-title','Dos redes');await setSelect('item-client','pr');
  await click('label.network-chip:has(input[value="a:tt"])');await click('#modal-submit');
  data=await stored();const two=data.items.find(x=>x.title==='Dos redes');
  assert('Two-network item stored once',data.items.filter(x=>x.title==='Dos redes').length===1&&two.networks.map(n=>n.accountId).join()==='ig,tt'&&two.platform==='instagram'&&two.accountId==='ig');
  await check('Both networks displayed',`[...document.querySelectorAll('#selected-day .post-card')].some(c=>c.textContent.includes('Dos redes')&&c.querySelector('.post-networks').textContent==='Instagram, TikTok'&&c.querySelector('.platform-more').textContent==='+1')`);

  // Edit networks: remove Instagram, then add it back.
  await click(`#selected-day [data-action=edit][data-id="${two.id}"]`);
  await check('Edit shows both selected',`document.querySelector('#item-networks input[value="a:ig"]').checked&&document.querySelector('#item-networks input[value="a:tt"]').checked`);
  await click('label.network-chip:has(input[value="a:ig"])');await click('#modal-submit');
  data=await stored();
  assert('Network removed',data.items.find(x=>x.id===two.id).networks.map(n=>n.accountId).join()==='tt'&&data.items.find(x=>x.id===two.id).platform==='tiktok');
  await click(`#selected-day [data-action=edit][data-id="${two.id}"]`);await click('label.network-chip:has(input[value="a:ig"])');await click('#modal-submit');
  data=await stored();
  assert('Network added back, same identity',data.items.find(x=>x.id===two.id).networks.map(n=>n.accountId).join()==='ig,tt'&&data.items.filter(x=>x.id===two.id).length===1);

  // Empty selection is rejected.
  await click(`#selected-day [data-action=edit][data-id="${one.id}"]`);await click('label.network-chip:has(input[value="a:ig"])');
  const beforeEmpty=await rawStored();await click('#modal-submit');
  await check('Saving without networks is rejected',`document.getElementById('modal-overlay').classList.contains('open')`);
  assert('Storage unchanged after rejected save',beforeEmpty===await rawStored());
  await evaluate(`document.querySelector('[data-action=close-modal]').click()`);await wait(60);

  // Undated multi-network idea.
  await click('#desktop-nav [data-page=ideas]');await click('[data-action=new-idea]');await fill('item-title','Idea multirred');await setSelect('item-client','pr');
  await click('label.network-chip:has(input[value="a:tt"])');await click('#modal-submit');
  data=await stored();const idea=data.items.find(x=>x.title==='Idea multirred');
  assert('Idea multirred stored undated',idea&&idea.date===null&&idea.networks.length===2);

  // Filters in Calendar, Banco de ideas and Seguimiento: once or not at all.
  const count=(selector,id)=>evaluate(`document.querySelectorAll(${JSON.stringify(selector)}+'[data-id="'+${JSON.stringify(id)}+'"]').length`);
  for(const [platform,expected] of [['all',1],['instagram',1],['tiktok',1],['facebook',0]]){
    await click('#desktop-nav [data-page=calendar]');await setSelect('filter-platform',platform);
    assert(`Calendar month ${platform}: ${expected}`,await count('.cal-event-content',two.id)===expected);
    assert(`Selected day ${platform}: ${expected}`,await count('#selected-day .post-card [data-action=edit]',two.id)===expected);
    await click('#desktop-nav [data-page=ideas]');
    assert(`Ideas ${platform}: ${expected}`,await count('.idea-grid [data-action=edit]',idea.id)===expected);
    await click('#desktop-nav [data-page=progress]');
    assert(`Seguimiento ${platform}: ${expected}`,await count('.next-item [data-action=edit]',two.id)===expected);
    const s=await stored(),dated=s.items.filter(x=>x.date&&(platform==='all'||x.networks.some(n=>n.platform===platform)));
    await check(`Planificadas metric counts each item once (${platform})`,`[...document.querySelectorAll('.metric')].find(e=>e.querySelector('.metric-label').textContent==='Planificadas').querySelector('.metric-value').textContent===${JSON.stringify(String(dated.filter(x=>x.status!=='published').length))}`);
  }
  await setSelect('filter-platform','all');
  data=await stored();
  for(const old of seed.items){const now=data.items.find(x=>x.id===old.id);assert('Legacy item still intact '+old.id,['title','caption','platform','status','date','clientId','accountId'].every(k=>now[k]===old[k]));}

  // Posts-only import of the documented example.
  const example=JSON.parse(await readFile(join(root,'docs','ejemplo-importacion-publicaciones.json'),'utf8'));
  const beforeImport=await stored();
  await openPostsImport('pr');
  await check('Full-restore warning hidden in posts mode',`document.getElementById('import-full-warning').hidden&&document.querySelector('#manager-form [type=submit]').disabled`);
  await setFile('#import-posts-file',join(root,'docs','ejemplo-importacion-publicaciones.json'));
  let p=await preview();
  assert('Preview counts',p['Cliente de destino']==='Planifica tus redes'&&p['Publicaciones detectadas']==='3'&&p['Publicaciones válidas']==='3'&&p['Ya importadas (se omitirán)']==='0'&&p['Con errores']==='0'&&p['Nuevas para agregar']==='3');
  await click('#manager-form [type=submit]');
  data=await stored();
  assert('All previous items preserved unchanged',beforeImport.items.every(old=>JSON.stringify(data.items.find(x=>x.id===old.id))===JSON.stringify(old)));
  assert('Clients, accounts and preferences unchanged',JSON.stringify([data.clients,data.accounts,data.preferences])===JSON.stringify([beforeImport.clients,beforeImport.accounts,beforeImport.preferences]));
  const imported=data.items.filter(x=>x.importId);
  assert('Three items imported',imported.length===3&&data.items.length===beforeImport.items.length+3);
  for(const row of example.items){
    const x=imported.find(i=>i.importId===row.importId);
    assert('Imported intact '+row.importId,x&&x.clientId==='pr'&&x.title===row.title&&x.caption===row.caption&&x.type===row.type&&x.status===row.status&&x.date===null&&JSON.stringify(x.networks.map(n=>n.platform))===JSON.stringify(row.networks)&&x.networks.every(n=>n.accountId===(n.platform==='instagram'?'ig':'tt')));
  }

  // Re-importing the same file detects duplicates and writes nothing.
  const afterFirst=await rawStored();
  await openPostsImport('pr');await setFile('#import-posts-file',join(root,'docs','ejemplo-importacion-publicaciones.json'));
  p=await preview();
  assert('Duplicates detected',p['Ya importadas (se omitirán)']==='3'&&p['Nuevas para agregar']==='0');
  await check('Submit disabled for duplicates',`document.querySelector('#manager-form [type=submit]').disabled`);
  await closeDialog();assert('No duplicates written',afterFirst===await rawStored());

  // Long caption, 120-character title, account referenced by username.
  const longCaption=Array.from({length:400},(_,i)=>`Línea ${i+1} del guion — «comillas», emojis 🎬 y saltos de línea.`).join('\n').slice(0,19990);
  const longTitle='T'.repeat(120);
  const longFile=await tmpJSON('largo.json',{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'largo-1',title:longTitle,caption:longCaption,networks:[{platform:'tiktok',username:'planificatusredes'}]}]});
  await openPostsImport('pr');await setFile('#import-posts-file',longFile);await click('#manager-form [type=submit]');
  data=await stored();const long=data.items.find(x=>x.importId==='largo-1');
  assert('Long caption imported without truncation',long&&long.caption===longCaption&&long.caption.length===longCaption.length&&long.title===longTitle&&long.type==='post'&&long.status==='idea'&&long.date===null&&long.networks[0].accountId==='tt');

  // Invalid records block the whole import: unknown network, mixed valid + invalid, bad fields.
  const invalidCases={
    'red inexistente':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'ok-1',title:'Válida',networks:['instagram']},{importId:'fb-1',title:'Con Facebook',networks:['instagram','facebook']}]},
    'campos inválidos':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'mal id',title:'',networks:[],status:'borrador',date:'2026-02-30',script:'x'}]},
    'importId repetido':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'rep',title:'A',networks:['tiktok']},{importId:'rep',title:'B',networks:['tiktok']}]},
    'caption excesivo':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'big',title:'A',caption:'x'.repeat(20001),networks:['tiktok']}]},
    'título multilínea':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'multi',title:'Línea 1\nLínea 2',networks:['tiktok']}]},
    'propiedad clientId no admitida':{format:'planifica-tus-redes-publicaciones',version:1,items:[{importId:'cid',title:'A',networks:['tiktok'],clientId:'pr'}]}
  };
  for(const [name,payload] of Object.entries(invalidCases)){
    const before=await rawStored(),file=await tmpJSON(name.replace(/\s/g,'-')+'.json',payload);
    await openPostsImport('pr');await setFile('#import-posts-file',file);
    await check('Errors listed: '+name,`document.querySelectorAll('.import-errors li').length>0&&document.querySelector('#manager-form [type=submit]').disabled`);
    if(name==='red inexistente')await check('Error names the missing network',`document.querySelector('.import-errors').textContent.includes('no tiene configurada la red Facebook (facebook)')`);
    await closeDialog();assert('Storage unchanged: '+name,before===await rawStored());
  }
  for(const [name,text] of [['JSON con sintaxis inválida','{"format": "planifica-tus-redes-publicaciones", "items": ['],['respaldo completo',JSON.stringify({app:'Planifica tus Redes',version:2,items:[],clients:[],accounts:[]})],['sin format',JSON.stringify({version:1,items:[]})]]){
    const before=await rawStored(),file=await tmpJSON(name.replace(/\s/g,'-')+'.json',text);
    await openPostsImport('pr');await setFile('#import-posts-file',file);
    await check('Fatal error shown: '+name,`!!document.querySelector('#import-preview .import-status.is-error')&&document.querySelector('#manager-form [type=submit]').disabled`);
    await closeDialog();assert('Storage unchanged: '+name,before===await rawStored());
  }
  // Same file into a client that lacks TikTok: rejected, nothing written.
  {const before=await rawStored();await openPostsImport('otro');await setFile('#import-posts-file',join(root,'docs','ejemplo-importacion-publicaciones.json'));
   await check('Client without the networks rejects the file',`document.querySelectorAll('.import-errors li').length===3`);await closeDialog();assert('Storage unchanged for other client',before===await rawStored());}

  // Full restore still works, round-trips multi-network items and still asks for confirmation.
  const current=await stored();
  const backup={...current,app:'Planifica tus Redes',version:2,items:current.items.filter(x=>x.id!=='old2')};
  const backupFile=await tmpJSON('respaldo.json',backup);
  await click('.sidebar .backup-btn[data-action=import]');
  await check('Full mode default with warning',`document.querySelector('input[name=mode][value=full]').checked&&!document.getElementById('import-full-warning').hidden&&document.querySelector('#manager-form [type=submit]').textContent==='Elegir archivo de respaldo'`);
  await closeDialog();
  await setFile('#import-file',backupFile);await wait(200);
  data=await stored();
  assert('Full restore replaced data',!data.items.some(x=>x.id==='old2')&&data.items.length===current.items.length-1);
  assert('Full restore keeps multi-network items',canon(data.items.find(x=>x.id===two.id))===canon(current.items.find(x=>x.id===two.id))&&data.items.filter(x=>x.importId).length===4);
  {const before=await rawStored();await setFile('#import-file',join(root,'docs','ejemplo-importacion-publicaciones.json'));await wait(150);
   await check('Full restore explains posts-only files',`document.getElementById('toast').textContent.includes('Importar únicamente publicaciones')`);assert('Storage unchanged after wrong file in full restore',before===await rawStored());}

  // Reload: persisted multi-network data survives normalization.
  const persisted=await rawStored();await evaluate('location.reload()');await wait(250);await ready();
  assert('Reload keeps data identical',JSON.parse(persisted).items.length===(await stored()).items.length&&canon(JSON.parse(persisted).items)===canon((await stored()).items));

  if(errors.length)throw Error(JSON.stringify(errors));
  console.log(`OK ${passed} checks: multi-network create/edit/filters/metrics, legacy compatibility, posts-only import, duplicates, validation and full restore, without JS/CSP errors`);
}finally{
  ws.close();proc.kill();server.close();await new Promise(ok=>proc.exitCode!==null?ok():proc.once('exit',ok));
  if(!resolve(profile).startsWith(resolve(tmpdir())+sep)||!basename(profile).startsWith('planifica-multirred-'))throw Error('Unexpected test profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
