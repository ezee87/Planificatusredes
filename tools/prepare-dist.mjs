// Local packaging only. This script never deploys or modifies browser storage.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
// Netlify injects this inline script for its badge after the uploaded files are built.
// Keep its exact browser-reported hash alongside the hashes calculated from our HTML.
const NETLIFY_BADGE_SCRIPT_HASH="'sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw='";
const favicon=await readFile(join(root,'favicon.svg'));
const faviconVersion=createHash('sha256').update(favicon).digest('hex').slice(0,12);
if(!favicon.toString('utf8').trimStart().startsWith('<svg'))throw new Error('favicon.svg no es un SVG válido.');
const hashes=new Set();
for(const file of ['index.html','legal/index.html']){
  const html=await readFile(join(root,file),'utf8');
  const expected=file==='index.html'?`favicon.svg?v=${faviconVersion}`:`../favicon.svg?v=${faviconVersion}`;
  if(!html.includes(`href="${expected}"`))throw new Error(`${file}: la versión del favicon no coincide con su SHA-256.`);
  for(const [,attributes,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/\bsrc\s*=/.test(attributes))hashes.add("'sha256-"+createHash('sha256').update(body.replace(/\r\n?/g,'\n')).digest('base64')+"'");
  }
}
hashes.add(NETLIFY_BADGE_SCRIPT_HASH);
const headers=(await readFile(join(root,'_headers'),'utf8')).replace(/script-src [^;]+;/,"script-src 'self' "+[...hashes].join(' ')+';');
if(/script-src[^;]*'unsafe-inline'/.test(headers))throw new Error('La CSP no debe permitir unsafe-inline para scripts.');
await writeFile(join(root,'_headers'),headers);
// Vercel no lee _headers: vercel.json recibe los mismos encabezados, sin el hash del badge que sólo inyecta Netlify.
const vercelHeaders=[];
const headerLines=headers.split(/\r?\n/);
for(const line of headerLines.slice(headerLines.indexOf('/*')+1)){
  const match=line.match(/^\s+([\w-]+):\s*(.+?)\s*$/);if(!match)break;
  vercelHeaders.push({key:match[1],value:match[1]==='Content-Security-Policy'?match[2].replace(' '+NETLIFY_BADGE_SCRIPT_HASH,''):match[2]});
}
if(!vercelHeaders.some(h=>h.key==='Content-Security-Policy'))throw new Error('_headers: no se encontró la CSP para vercel.json.');
const vercel=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
vercel.headers=[{source:'/(.*)',headers:vercelHeaders}];
await writeFile(join(root,'vercel.json'),JSON.stringify(vercel,null,2)+'\n');
await mkdir(join(root,'dist','legal'),{recursive:true});
for(const file of ['index.html','commercial.js','commercial.css','custom-selects.js','custom-selects.css','bonos-data.js','bonos.js','bonos.css','favicon.svg','legal/index.html','_headers','_redirects'])await copyFile(join(root,file),join(root,'dist',file));
console.log('dist preparado; CSP con '+hashes.size+' hashes. Sin publicación.');
