/* Canonical Soft SVG 56 registry — source icons are never rewritten. */
(function(global){
 'use strict';
 const ROOT=new URL('studio/icons/svg/',document.baseURI);
 const MANIFEST=new URL('studio/icons/manifest.json',document.baseURI);
 let names=[],loaded=false,known=new Set();
 const isSafe=name=>typeof name==='string'&&/^[a-z][a-z0-9-]{0,60}$/.test(name);
 function icon(name,{size=18,label='',decorative=true}={}){
  if(!isSafe(name))return document.createTextNode(label||'');
  if(loaded&&!known.has(name))return document.createTextNode(':icon('+name+'):');
  const s=document.createElement('span');s.className='studio-icon';
  const url=new URL(name+'.svg',ROOT).href;
  s.style.setProperty('--studio-icon-url','url("'+url+'")');
  const value=Math.max(12,Math.min(48,Number(size)||18));
  s.style.width=value+'px';s.style.height=value+'px';
  if(decorative)s.setAttribute('aria-hidden','true');
  else{s.setAttribute('role','img');s.setAttribute('aria-label',label||name)}
  return s;
 }
 const ready=fetch(MANIFEST,{cache:'no-cache'}).then(async response=>{
  if(!response.ok)throw Error('SVG manifest: HTTP '+response.status);
  const m=await response.json();const list=[...(m.base||[]),...(m.fill||[]),...(m.additional||[])];
  if(list.length!==56||new Set(list).size!==56||list.some(name=>!isSafe(name)))throw Error('SVG manifest 무결성 오류');
  names=list;known=new Set(list);loaded=true;return [...list];
 }).catch(err=>{console.error('Studio Icons:',err);loaded=true;names=[];known.clear();return []});
 function list(filter=''){
  const q=String(filter).toLowerCase().trim();
  return names.filter(name=>name.includes(q));
 }
 function has(name){return known.has(name)}
 function token(name){return ':icon('+name+'):';
 }
 function decorate(root=document){
  for(const btn of root.querySelectorAll('[data-studio-icon]')){
   if(btn.querySelector('.studio-icon'))continue;
   const name=btn.getAttribute('data-studio-icon');
   if(!has(name))continue;
   btn.prepend(icon(name,{size:17}));
  }
 }
 function gallery(container,search,onChoose){
  if(!container||!search||typeof onChoose!=='function')throw Error('Icon gallery controls missing');
  function render(){
   container.replaceChildren();
   const choices=list(search.value);
   if(!choices.length){
    const empty=document.createElement('p');empty.className='hint';empty.textContent='검색 결과 없음';
    container.append(empty);return;
   }
   for(const name of choices){
    const card=document.createElement('div');card.className='icon-card';
    const pick=document.createElement('button');pick.type='button';pick.className='icon-pick';
    pick.title=name+' · 원고에 추가';pick.setAttribute('aria-label',name+' 아이콘 삽입');
    pick.append(icon(name,{size:25}));
    const label=document.createElement('span');label.className='icon-label';label.textContent=name;pick.append(label);
    pick.addEventListener('click',()=>onChoose(name));
    const copy=document.createElement('button');copy.type='button';copy.className='icon-copy';
    copy.title=name+' 이름 복사';copy.setAttribute('aria-label',name+' 아이콘 이름 복사');
    copy.textContent='복사';
    copy.addEventListener('click',async()=>{
     try{await navigator.clipboard.writeText(name);copy.textContent='완료'}
     catch(_){onChoose(name)}
    });
    card.append(pick,copy);container.append(card);
   }
  }
  search.addEventListener('input',render);render();
 }
 global.StudioIcons=Object.freeze({ready,icon,list,has,token,gallery,decorate});
})(window);
