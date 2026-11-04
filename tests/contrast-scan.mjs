// Computed solid-color checks. Gradients, images and native popup UI need visual review.
export function scanContrast(){
  const rgb=s=>{const v=s.match(/[\d.]+/g)?.map(Number)||[0,0,0];return [...v.slice(0,3),v[3]??1];};
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  const bg=el=>{const chain=[];for(let e=el;e;e=e.parentElement)chain.unshift(e);return chain.reduce((c,e)=>over(rgb(getComputedStyle(e).backgroundColor),c),[255,255,255,1]);};
  const visible=el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!el.closest('[hidden],[inert]')&&!el.matches(':disabled')&&!['OPTION','SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName);
  const rows=[];
  const add=(el,kind,color,background,min,text='')=>{const r=ratio(color,background);rows.push({kind,selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.'),text:text.slice(0,70),fg:hex(color),bg:hex(background),ratio:+r.toFixed(3),min,pass:r>=min});};
  for(const el of document.querySelectorAll('body *')){
    if(!visible(el))continue;
    const st=getComputedStyle(el),background=bg(el);
    const direct=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
    const control=el.matches('input:not([type=hidden]):not([type=color]),textarea,select');
    if(direct||control){
      let color=rgb(st.color);color[3]*=Number(st.opacity);color=over(color,background);
      add(el,'text',color,background,parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.6667&&parseInt(st.fontWeight)>=700)?3:4.5,direct||el.value||el.getAttribute('aria-label')||'input');
    }
    if(control&&el.getAttribute('placeholder')){const ps=getComputedStyle(el,'::placeholder'),c=rgb(ps.color);c[3]*=Number(ps.opacity);add(el,'placeholder',over(c,background),background,4.5,el.getAttribute('placeholder'));}
    if(el.matches('input:not([type=hidden]):not([type=color]),textarea,select'))add(el,'control-border',over(rgb(st.borderTopColor),bg(el.parentElement)),bg(el.parentElement),3);
    if(el.matches('button,a')&&el.querySelector('svg')&&!el.textContent.trim())add(el,'icon',over(rgb(st.color),background),background,3,el.getAttribute('aria-label')||'');
    if(st.outlineStyle!=='none'&&parseFloat(st.outlineWidth)>0)add(el,'focus',over(rgb(st.outlineColor),bg(el.parentElement)),bg(el.parentElement),3);
    if(el.matches('.calendar-day.is-selected')&&st.boxShadow!=='none')add(el,'selection-ring',rgb(st.boxShadow.match(/rgba?\([^)]+\)/)[0]),background,3);
  }
  return rows;
}
