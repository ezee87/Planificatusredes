import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {scanContrast} from './contrast-scan.mjs';

export async function verifyRelease({send,evaluate,wait,check,root,port,posted,setPost}){
  const browser=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const click=s=>browser(s=>document.querySelector(s).click(),s);
  const ready=async fn=>{for(let i=0;i<100;i++){if(await browser(fn))return;await wait(30);}throw Error('Timeout');};
  const go=async path=>{await send('Page.navigate',{url:'http://127.0.0.1:'+port+path});await wait(180);await ready(()=>document.readyState==='complete'&&!!window.PlanificaCommercial);};
  const visual=join(root,'tests','visual-cierre');await mkdir(visual,{recursive:true});
  const shot=async name=>{await wait(180);const x=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(visual,name+'.png'),Buffer.from(x.data,'base64'));};
  const fields={
    'planifica-soporte':['form-name','bot-field','nombre','email','motivo','descripcion'],
    'planifica-reclamos':['form-name','bot-field','email','tipo','descripcion','identificador-compra']
  };
  const html=await readFile(join(root,'dist','index.html'),'utf8');
  const redirects=await readFile(join(root,'dist','_redirects'),'utf8');
  const vercel=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  check('Vercel reenvía formularios a Netlify Forms',vercel.rewrites?.some(r=>r.source==='/netlify-forms'&&r.destination==='https://planifica-tus-redes-abcd.netlify.app/'));
  check('Vercel publica sólo dist',vercel.outputDirectory==='dist');
  const netlifyRules=[...redirects.matchAll(/^(\/\S+)\s+(\S+)\s+(\d{3})$/gm)].map(([,source,destination,status])=>({source,destination,status:+status}));
  check('Vercel replica las rutas de _redirects',netlifyRules.length===6&&netlifyRules.every(r=>r.status===200?vercel.rewrites.some(v=>v.source===r.source&&v.destination===r.destination):vercel.redirects.some(v=>v.source===r.source&&v.destination===r.destination&&v.statusCode===r.status)));
  const netlifyHeaders=[...(await readFile(join(root,'dist','_headers'),'utf8')).matchAll(/^\s+([\w-]+):\s*(.+?)\s*$/gm)].map(([,key,value])=>({key,value:key==='Content-Security-Policy'?value.replace(/ 'sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw='/,''):value}));
  check('Vercel aplica los encabezados de _headers',vercel.headers?.length===1&&vercel.headers[0].source==='/(.*)'&&JSON.stringify(vercel.headers[0].headers)===JSON.stringify(netlifyHeaders));
  check('Ruta de arrepentimiento unificada',/^\/arrepentimiento\s+https:\/\/planificatusredes\.netlify\.app\/contacto\.html\s+301$/m.test(redirects));
  const statics=await browser(html=>{const d=new DOMParser().parseFromString(html,'text/html');return [...d.querySelectorAll('form[netlify]')].map(f=>({name:f.name,method:f.getAttribute('method'),netlify:f.hasAttribute('netlify'),hp:f.getAttribute('netlify-honeypot'),formName:f.querySelector('[name="form-name"]').value,fields:[...f.querySelectorAll('[name]')].map(x=>x.name),hidden:!!f.closest('[hidden]')}));},html);
  check('Dos declaraciones HTML estaticas unicas',statics.length===2&&new Set(statics.map(f=>f.name)).size===2);
  check('Favicon versionado, publicado y decodificable',await browser(async()=>{const link=document.querySelector('link[rel="icon"][type="image/svg+xml"]'),url=new URL(link?.href||'',location.href);if(url.pathname!=='/favicon.svg'||url.search!=='?v=c5b5f2837566')return false;const response=await fetch(url);if(!response.ok||!response.headers.get('content-type').startsWith('image/svg+xml')||!(await response.clone().text()).startsWith('<svg'))return false;return await new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>resolve(false);image.src=url.href;});}));
  for(const f of statics)check('Declaracion completa POST '+f.name,f.method==='POST'&&f.netlify&&f.formName===f.name&&f.hp==='bot-field'&&f.hidden&&JSON.stringify(f.fields)===JSON.stringify(fields[f.name]));
  const measurements=[];
  const contrast=async label=>{await wait(160);const rows=await browser(scanContrast);measurements.push({label,rows});const bad=rows.filter(x=>!x.pass);check('Contraste '+label,bad.length===0,JSON.stringify(bad));};
  await go('/');
  check('Marca visible con capitalización oficial',await browser(()=>!document.title.includes('Planifica tus Redes')&&!document.body.innerText.includes('Planifica tus Redes')));
  const docs=await browser(()=>JSON.stringify(PlanificaCommercial.docs));
  const baseline=JSON.parse(await readFile(join(root,'tests','cierre-baseline.json'),'utf8'));
  check('Textos legales intactos',createHash('sha256').update(docs).digest('hex')===baseline.docsHash);
  const core=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\r\n/g,'\n').replace(/^.*if\(a==='license'\).*\n/m,'');
  check('Logica auditada intacta salvo acceso del footer',createHash('sha256').update(core).digest('hex')===baseline.coreHash);
  for(const width of [1440,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<790});
    for(const page of ['calendar','ideas','progress','clients','help']){
      await click(page==='help'?'[data-action="help"]':'#desktop-nav [data-page="'+page+'"]');
      check('Footer unico '+page+' '+width,await browser(()=>document.querySelectorAll('footer').length===1&&!!document.querySelector('.app-footer a[data-action="license"]')));
      await browser(()=>{document.querySelector('.app-footer a').focus();document.querySelector('.app-footer').scrollIntoView({block:'end',behavior:'instant'});});await wait(80);
      check('Footer sin superposicion ni desborde '+page+' '+width,await browser(()=>{const f=document.querySelector('.app-footer'),r=f.getBoundingClientRect(),n=document.querySelector('#mobile-nav');return !['fixed','sticky'].includes(getComputedStyle(f).position)&&document.documentElement.scrollWidth<=innerWidth+1&&(getComputedStyle(n).display==='none'||r.bottom<=n.getBoundingClientRect().top+1);}));
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      check('Licencia directa con Enter '+page+' '+width,await browser(()=>!!document.querySelector('.legal-document')&&document.querySelector('.legal-document').textContent.includes('Licencia de uso de Planifica tus redes')&&document.activeElement.hasAttribute('data-commercial-back')));
    }
    await click('#desktop-nav [data-page="calendar"]');await click('[data-action="mode"][data-mode="month"]');await browser(()=>scrollTo({top:0,behavior:'instant'}));await contrast('calendario '+width);await shot('calendario-'+width);
    await browser(()=>document.querySelector('.app-footer').scrollIntoView({block:'end',behavior:'instant'}));await shot('footer-'+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('DOM.enable');await send('CSS.enable');
  const states=async label=>{
    const selectors=await browser(()=>{const seen=new Set();return [...document.querySelectorAll('button,a,input:not([type=hidden]),select,textarea')].filter(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!e.closest('[inert]')&&!e.disabled).map(e=>{const s=e.id?'#'+CSS.escape(e.id):e.tagName.toLowerCase()+[...e.classList].map(c=>'.'+CSS.escape(c)).join('');if(seen.has(s))return null;seen.add(s);return s;}).filter(Boolean);});
    const doc=(await send('DOM.getDocument')).root.nodeId;
    for(const selector of selectors){
      const {nodeId}=await send('DOM.querySelector',{nodeId:doc,selector});if(!nodeId)continue;
      for(const pseudo of [['hover'],['focus','focus-visible']]){
        await send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:pseudo});await contrast(label+' '+selector+' '+pseudo.join('/'));
      }
      await send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    }
  };
  await click('#desktop-nav [data-page="calendar"]');await states('calendario');
  await click('[data-action="new-post"]');await contrast('modal');
  check('Footer aislado por modal',await browser(()=>document.querySelector('.app-footer').closest('.app').inert));await shot('modal');await states('modal');await click('[data-action="close-modal"]');
  for(const page of ['ideas','progress','clients']){await click('#desktop-nav [data-page="'+page+'"]');await contrast(page);await states(page);}
  await click('[data-action="help"]');await contrast('ayuda');await states('ayuda');await shot('ayuda-desktop');
  for(const name of Object.keys(fields)){
    await go('/');await click('[data-action="help"]');await click(name==='planifica-soporte'?'[data-support-open="support"]':'[data-support-open="claim"]');
    const selector=name==='planifica-soporte'?'#support-form-panel form':'#claim-form-panel form';
    await browser(s=>window.qaForm=document.querySelector(s),selector);
    const visible=await browser(()=>{const f=window.qaForm,hp=f.elements['bot-field'];return {name:f.name,method:f.method,formName:f.elements['form-name'].value,fields:[...f.elements].filter(x=>x.name).map(x=>x.name),hidden:!!hp.closest('[hidden][aria-hidden="true"]'),tab:hp.tabIndex,alert:f.querySelector('.commercial-message').getAttribute('role')};});
    check('Formulario visible coincide '+name,visible.name===name&&visible.method==='post'&&visible.formName===name&&JSON.stringify(visible.fields)===JSON.stringify(fields[name]));
    check('Honeypot excluido y aviso accesible '+name,visible.hidden&&visible.tab===-1&&visible.alert==='alert');
    const count=posted.length;await browser(()=>qaForm.requestSubmit());await wait(50);check('Validacion impide envio vacio '+name,posted.length===count);
    await browser(()=>{for(const e of qaForm.elements){if(!e.name||['form-name','bot-field'].includes(e.name))continue;if(e.tagName==='SELECT')e.selectedIndex=1;else e.value=e.type==='email'?'qa@example.com':'Prueba local & + = ñ';}});
    setPost(201,250);await browser(()=>{qaForm.requestSubmit();qaForm.requestSubmit();});
    check('Boton deshabilitado durante POST '+name,await browser(()=>qaForm.querySelector('[type=submit]').disabled));
    await ready(()=>!qaForm.querySelector('[type=submit]').disabled);
    check('Un solo POST y exito 2xx '+name,posted.length===count+1&&await browser(()=>qaForm.querySelector('.commercial-message').classList.contains('success')));
    const request=posted.at(-1),body=new URLSearchParams(request.body);
    check('Payload urlencoded completo '+name,request.path==='/netlify-forms'&&request.method==='POST'&&request.type==='application/x-www-form-urlencoded'&&body.get('form-name')===name&&body.get('bot-field')===''&&JSON.stringify([...body.keys()])===JSON.stringify(fields[name])&&body.get('email')==='qa@example.com'&&body.get(name==='planifica-soporte'?'nombre':'identificador-compra')==='Prueba local & + = ñ');
    await contrast(name+' exito');
    await browser(()=>{qaForm.elements.email.value='qa@example.com';if(qaForm.elements.motivo)qaForm.elements.motivo.selectedIndex=1;if(qaForm.elements.tipo)qaForm.elements.tipo.selectedIndex=1;if(qaForm.elements.descripcion)qaForm.elements.descripcion.value='Prueba de error';});
    setPost(500);await browser(()=>qaForm.requestSubmit());await ready(()=>qaForm.querySelector('.commercial-message').classList.contains('error'));
    check('Error HTTP conserva datos y contacto '+name,await browser(()=>qaForm.elements.email.value==='qa@example.com'&&!!qaForm.querySelector('.commercial-message a[href^="mailto:"]')&&!qaForm.querySelector('[type=submit]').disabled));
    await contrast(name+' error');await states(name);await shot(name);
  }
  setPost(200);await writeFile(join(root,'tests','contraste-estados.json'),JSON.stringify(measurements,null,2));
}
