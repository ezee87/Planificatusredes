// Local build step: converts the editorial Markdown in Bonos/ into bonos-data.js.
// The Markdown files are read-only sources. Text is copied line by line, without
// rewriting; the script fails if any non-structural source line is not used.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=async name=>(await readFile(join(root,'Bonos',name),'utf8')).replace(/^﻿/,'').replace(/\r\n?/g,'\n').split('\n');
const used=new Map();
const mark=(file,index)=>{if(!used.has(file))used.set(file,new Set());used.get(file).add(index);};
const take=(file,lines,from,to)=>{const out=[];for(let i=from;i<to;i++){mark(file,i);out.push(lines[i]);}return trimBlock(out);};
const trimBlock=block=>{let a=0,b=block.length;while(a<b&&!block[a].trim())a++;while(b>a&&!block[b-1].trim())b--;return block.slice(a,b).join('\n');};
const labelValue=(file,lines,index,label)=>{const line=lines[index];const prefix=`**${label}:**`;if(!line.startsWith(prefix))throw Error(`${file}:${index+1}: se esperaba ${prefix}`);mark(file,index);return line.slice(prefix.length).trim();};
const find=(lines,from,test,to=lines.length)=>{for(let i=from;i<to;i++)if(test(lines[i],i))return i;return -1;};
const ensure=(cond,msg)=>{if(!cond)throw Error(msg);};

// ---------- Bono 1 ----------
const F1='bono-1-ideas-de-contenido.md',L1=await read(F1);
// Category markers ("Categoría 02 · ...") and separators are layout artifacts of the
// source document, not part of any idea. Categories follow the bonus structure: 6 per group.
const structural1=(line)=>/^\**Categoría \d+/.test(line.trim())||/^-{2,}$/.test(line.trim());
const CATEGORIES=[['educativo','Educativo'],['interaccion','Interacción'],['autoridad','Autoridad'],['promocional','Promocional'],['confianza','Confianza y comunidad']];
const starts=L1.map((l,i)=>/^## \d{2}\. /.test(l)?i:-1).filter(i=>i>=0);
ensure(starts.length===30,`Bono 1: se esperaban 30 ideas y hay ${starts.length}`);
const ideas=starts.map((start,n)=>{
  const end=n+1<starts.length?starts[n+1]:L1.length;
  const lines=L1.slice(0,end);
  // Ignore structural lines in this range so they do not leak into the last section.
  const stop=(()=>{let e=end;while(e>start&&(structural1(L1[e-1])||!L1[e-1].trim())){if(structural1(L1[e-1]))mark(F1,e-1);e--;}return e;})();
  mark(F1,start);
  const [,num,title]=L1[start].match(/^## (\d{2})\. (.+)$/);
  const at=(label,from)=>{const i=find(lines,from,l=>l.startsWith(label),stop);ensure(i>0,`Bono 1 idea ${num}: falta ${label}`);return i;};
  const iObj=at('**Objetivo:**',start),iFmt=at('**Formato recomendado:**',start),iModel=at('**Modelo narrativo:**',start);
  const iTpl=at('**Plantilla adaptable**',start),iEx=at('**Ejemplo práctico**',start),iAdapt=at('**Cómo adaptarla a otros clientes**',start);
  ensure(iObj<iFmt&&iFmt<iModel&&iModel<iTpl&&iTpl<iEx&&iEx<iAdapt,`Bono 1 idea ${num}: orden de apartados inesperado`);
  for(let i=start+1;i<iObj;i++)ensure(!L1[i].trim(),`Bono 1 idea ${num}: texto inesperado antes del objetivo`);
  const between=(a,b)=>{for(let i=a+1;i<b;i++)ensure(!L1[i].trim(),`Bono 1 idea ${num}: texto inesperado en línea ${i+1}`);};
  between(iObj,iFmt);between(iFmt,iModel);between(iModel,iTpl);
  [iTpl,iEx,iAdapt].forEach(i=>mark(F1,i));
  const objective=labelValue(F1,L1,iObj,'Objetivo'),format=labelValue(F1,L1,iFmt,'Formato recomendado'),model=labelValue(F1,L1,iModel,'Modelo narrativo');
  const template=take(F1,L1,iTpl+1,iEx),example=take(F1,L1,iEx+1,iAdapt),adapt=take(F1,L1,iAdapt+1,stop);
  const category=CATEGORIES[Math.floor(n/6)][0];
  // Card summary only: duration of the main format (first sentence), when it has one.
  const duration=(format.split('. ')[0].match(/\d+(?:–\d+)? segundos/)||[''])[0];
  return {id:'idea-'+num,number:num,title,category,objective,format,duration,model,template,example,adapt};
});

// ---------- Bono 2 ----------
const F2='bono-2-guia-de-organizacion.md',L2=await read(F2);
const stageIdx=L2.map((l,i)=>/^# ETAPA \d{2} — /.test(l)?i:-1).filter(i=>i>=0);
ensure(stageIdx.length===4,'Bono 2: se esperaban 4 etapas');
const checklistStart=find(L2,0,l=>l==='**TU CHECKLIST SEMANAL DE ORGANIZACIÓN**');
const closingStart=find(L2,0,l=>l==='**CÓMO APROVECHAR ESTA GUÍA**');
ensure(checklistStart>0&&closingStart>checklistStart,'Bono 2: falta checklist o cierre');
const guideTitle=L2[0].replace(/^\*\*|\*\*$/g,''),guideSubtitle=L2[2].replace(/^\*\*|\*\*$/g,'');mark(F2,0);mark(F2,2);
const guideIntro=take(F2,L2,3,stageIdx[0]);
const TIP_SECTIONS=[['what','Qué hacer'],['why','Por qué funciona'],['how','Cómo aplicarlo'],['app','Aplicalo en Planifica tus redes']];
const stages=stageIdx.map((start,s)=>{
  const end=s+1<stageIdx.length?stageIdx[s+1]:checklistStart;mark(F2,start);
  const [,num,rawTitle]=L2[start].match(/^# ETAPA (\d{2}) — (.+)$/);
  const tipIdx=[];for(let i=start;i<end;i++)if(/^## \d{2}\. /.test(L2[i]))tipIdx.push(i);
  const intro=take(F2,L2,start+1,tipIdx[0]);
  const tips=tipIdx.map((t,k)=>{
    const tEnd=k+1<tipIdx.length?tipIdx[k+1]:end;mark(F2,t);
    const [,tnum,title]=L2[t].match(/^## (\d{2})\. (.+)$/);
    const pos=TIP_SECTIONS.map(([,label])=>{const i=find(L2,t,l=>l===`**${label}**`,tEnd);ensure(i>0,`Bono 2 consejo ${tnum}: falta ${label}`);mark(F2,i);return i;});
    const iHabit=find(L2,t,l=>l.startsWith('**Hábito recomendado:**'),tEnd);ensure(iHabit>pos[3],`Bono 2 consejo ${tnum}: falta hábito`);
    for(let i=iHabit+1;i<tEnd;i++)ensure(!L2[i].trim(),`Bono 2 consejo ${tnum}: texto inesperado después del hábito`);
    for(let i=t+1;i<pos[0];i++)ensure(!L2[i].trim(),`Bono 2 consejo ${tnum}: texto inesperado antes de Qué hacer`);
    const tip={id:'tip-'+tnum,number:tnum,title};
    TIP_SECTIONS.forEach(([key],j)=>{tip[key]=take(F2,L2,pos[j]+1,j<3?pos[j+1]:iHabit);});
    tip.habit=labelValue(F2,L2,iHabit,'Hábito recomendado');
    return tip;
  });
  // Stage names keep the original words; only the uppercase heading is shown in sentence case.
  const title=rawTitle.charAt(0)+rawTitle.slice(1).toLocaleLowerCase('es');
  return {id:'stage-'+num,number:num,title,intro,tips};
});
ensure(stages.map(s=>s.tips.length).join()==='3,3,2,2','Bono 2: distribución de consejos inesperada');
mark(F2,checklistStart);
const subtitleIdx=checklistStart+2;ensure(L2[subtitleIdx]==='**Una rutina sencilla para mantener todo bajo control**','Bono 2: subtítulo de checklist');mark(F2,subtitleIdx);
const dayIdx=[];for(let i=checklistStart;i<closingStart;i++)if(/^\*\*[A-ZÁÉÍÓÚ]+ — .+\*\*$/.test(L2[i]))dayIdx.push(i);
ensure(dayIdx.length===5,'Bono 2: se esperaban 5 días');
const checklistIntro=take(F2,L2,subtitleIdx+1,dayIdx[0]);
const DAY_KEYS=['lunes','martes','miercoles','jueves','viernes'];
const days=dayIdx.map((d,k)=>{
  const end=k+1<dayIdx.length?dayIdx[k+1]:closingStart;mark(F2,d);
  const [,day,focus]=L2[d].match(/^\*\*([A-ZÁÉÍÓÚ]+) — (.+)\*\*$/);
  const iObj=find(L2,d,l=>l.startsWith('**Objetivo:**'),end);const objective=labelValue(F2,L2,iObj,'Objetivo');
  const tasks=[];for(let i=iObj+1;i<end;i++){const line=L2[i];if(!line.trim())continue;ensure(line.startsWith('☐ '),`Bono 2: línea inesperada en checklist ${i+1}`);mark(F2,i);tasks.push({id:`${DAY_KEYS[k]}-${tasks.length+1}`,text:line.slice(2).trim()});}
  return {id:DAY_KEYS[k],day:day.charAt(0)+day.slice(1).toLocaleLowerCase('es'),focus,objective,tasks};
});
mark(F2,closingStart);
const guideClosing={title:'Cómo aprovechar esta guía',body:take(F2,L2,closingStart+1,L2.length)};
const taskCount=days.reduce((n,d)=>n+d.tasks.length,0);ensure(taskCount===21,`Bono 2: se esperaban 21 tareas y hay ${taskCount}`);

// ---------- Bono 3 ----------
const F3='bono-3-calendarios-de-ejemplo.md',L3=await read(F3);
const calIdx=L3.map((l,i)=>/^\*\*CALENDARIO \d{2} — .+\*\*$/.test(l)?i:-1).filter(i=>i>=0);
ensure(calIdx.length===3,'Bono 3: se esperaban 3 calendarios');
const usageStart=find(L3,0,l=>l==='**CÓMO UTILIZAR ESTOS CALENDARIOS**');ensure(usageStart>calIdx[2],'Bono 3: falta guía de uso');
const packTitle=L3[0].replace(/^\*\*|\*\*$/g,''),packSubtitle=L3[2].replace(/^\*\*|\*\*$/g,'');mark(F3,0);mark(F3,2);
const packIntro=take(F3,L3,3,calIdx[0]);
const SECTORS=[['gastronomia','Gastronomía','Cafetería'],['servicios','Servicios profesionales','Estudio de arquitectura e interiorismo'],['tiendas','Tiendas y emprendimientos','Tienda de indumentaria']];
const DAY_OFFSET={Lunes:0,Martes:1,Miércoles:2,Jueves:3,Viernes:4,Sábado:5,Domingo:6};
const calendars=calIdx.map((start,c)=>{
  const end=c+1<calIdx.length?calIdx[c+1]:usageStart;mark(F3,start);
  const exIdx=start+2;ensure(/^\*\*Ejemplo: .+\*\*$/.test(L3[exIdx]),'Bono 3: falta ejemplo');mark(F3,exIdx);
  const example=L3[exIdx].replace(/^\*\*Ejemplo: |\*\*$/g,'');
  const meta={};[['goal','Objetivo general'],['frequency','Frecuencia'],['distribution','Distribución'],['duration','Duración']].forEach(([k,label])=>{const i=find(L3,start,l=>l.startsWith(`**${label}:**`),end);meta[k]=labelValue(F3,L3,i,label);});
  const weekIdx=[];for(let i=start;i<end;i++)if(/^\*\*SEMANA \d — .+\*\*$/.test(L3[i]))weekIdx.push(i);
  ensure(weekIdx.length===4,'Bono 3: se esperaban 4 semanas');
  const weeks=weekIdx.map((w,k)=>{
    const wEnd=k+1<weekIdx.length?weekIdx[k+1]:end;mark(F3,w);
    const [,wn,theme]=L3[w].match(/^\*\*SEMANA (\d) — (.+)\*\*$/);
    const postIdx=[];for(let i=w;i<wEnd;i++)if(/^\*\*Publicación \d{2} — .+\*\*$/.test(L3[i]))postIdx.push(i);
    const posts=postIdx.map((p,j)=>{
      const pEnd=j+1<postIdx.length?postIdx[j+1]:wEnd;mark(F3,p);
      const [,pn,day]=L3[p].match(/^\*\*Publicación (\d{2}) — (.+)\*\*$/);ensure(Object.hasOwn(DAY_OFFSET,day),'Bono 3: día desconocido '+day);
      const get=label=>{const i=find(L3,p,l=>l.startsWith(`**${label}:**`),pEnd);ensure(i>0,`Bono 3 publicación ${pn}: falta ${label}`);return i;};
      const iTema=get('Tema'),iCat=get('Categoría'),iFmt=get('Formato'),iObj=get('Objetivo'),iDev=get('Desarrollo sugerido'),iCta=get('CTA');
      ensure(iTema<iCat&&iCat<iFmt&&iFmt<iObj&&iObj<iDev&&iDev<iCta,`Bono 3 publicación ${pn}: orden inesperado`);
      ensure(L3[iDev]==='**Desarrollo sugerido:**',`Bono 3 publicación ${pn}: desarrollo con texto en la misma línea`);mark(F3,iDev);
      const cta=labelValue(F3,L3,iCta,'CTA');
      for(let i=iCta+1;i<pEnd;i++)ensure(!L3[i].trim(),`Bono 3 publicación ${pn}: texto inesperado después del CTA`);
      return {id:`${SECTORS[c][0]}-${pn}`,number:pn,day,week:Number(wn),dayOffset:DAY_OFFSET[day],topic:labelValue(F3,L3,iTema,'Tema'),category:labelValue(F3,L3,iCat,'Categoría'),format:labelValue(F3,L3,iFmt,'Formato'),objective:labelValue(F3,L3,iObj,'Objetivo'),development:take(F3,L3,iDev+1,iCta),cta};
    });
    ensure(posts.length===3,'Bono 3: se esperaban 3 publicaciones por semana');
    return {number:Number(wn),theme,posts};
  });
  return {id:SECTORS[c][0],sector:SECTORS[c][1],business:SECTORS[c][2],heading:L3[start].replace(/^\*\*|\*\*$/g,''),example,...meta,weeks};
});
mark(F3,usageStart);
const packUsage={title:'Cómo utilizar estos calendarios',body:take(F3,L3,usageStart+1,L3.length)};
const postCount=calendars.reduce((n,c)=>n+c.weeks.reduce((m,w)=>m+w.posts.length,0),0);ensure(postCount===36,'Bono 3: se esperaban 36 publicaciones');

// ---------- Coverage: every non-empty source line must be used exactly as written ----------
for(const [file,lines] of [[F1,L1],[F2,L2],[F3,L3]]){
  const missing=lines.map((l,i)=>l.trim()&&!used.get(file)?.has(i)?i+1:0).filter(Boolean);
  ensure(!missing.length,`${file}: líneas sin incorporar: ${missing.slice(0,10).join(', ')}`);
}

const data={
  ideas:{categories:CATEGORIES.map(([id,label])=>({id,label})),items:ideas},
  guide:{title:guideTitle,subtitle:guideSubtitle,intro:guideIntro,stages,checklist:{title:'Tu checklist semanal de organización',subtitle:'Una rutina sencilla para mantener todo bajo control',intro:checklistIntro,days},closing:guideClosing},
  calendars:{title:packTitle,subtitle:packSubtitle,intro:packIntro,items:calendars,usage:packUsage}
};
const js=`// Generado por tools/build-bonos.mjs a partir de Bonos/*.md. No editar a mano.\nwindow.PlanificaBonosData=${JSON.stringify(data)};\n`;
await writeFile(join(root,'bonos-data.js'),js);
console.log(`bonos-data.js generado: ${ideas.length} ideas, ${stages.reduce((n,s)=>n+s.tips.length,0)} consejos, ${taskCount} tareas, ${postCount} publicaciones.`);
