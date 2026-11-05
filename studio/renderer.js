/* Shared Studio scene registry. Text content never becomes executable HTML. */
(function(global){
 'use strict';
 const registry=new Map();
 function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node}
 function appendMarked(node,value){
  const text=String(value??''),rx=/:icon\(([a-z][a-z0-9-]{0,60})\):/g;
  let start=0,match;
  while((match=rx.exec(text))){
   if(match.index>start)node.append(document.createTextNode(text.slice(start,match.index)));
   const name=match[1];
   if(global.StudioIcons?.has(name)){
    const mark=global.StudioIcons.icon(name,{size:16});mark.classList.add('scene-inline-icon');node.append(mark);
   }else node.append(document.createTextNode(match[0]));
   start=rx.lastIndex;
  }
  if(start<text.length)node.append(document.createTextNode(text.slice(start)));
 }
 function rich(tag,cls,text){const node=el(tag,cls);appendMarked(node,text);return node}
 function uiIcon(name,size=18){return global.StudioIcons?.has(name)?global.StudioIcons.icon(name,{size}):el('span','',name)}
 function paragraphs(text,host){
  for(const p of String(text||'').split(/\n\s*\n/).filter(s=>s.trim()))host.append(rich('p','',p.trim()));
 }
 function headingAndText(text){
  const lines=String(text||'').split('\n');
  const title=lines[0]?.trim().startsWith('# ')?lines.shift().trim().slice(2):'';
  return {title,body:lines.join('\n').trim()};
 }
 function markdownImage(text){
  const match=String(text).match(/!\[([^\]]*)\]\(([^)]+)\)/);
  return match?{alt:match[1],src:match[2].trim()}:null;
 }
 function sceneText(text){return String(text).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'').trim()}
 function imageElement(ref,ctx,cls){
  const img=el('img',cls);img.alt=ref.alt||'에피소드 이미지';img.loading='eager';
  img.src=ctx.resolveAsset(ref.src)||'';
  img.onerror=()=>{img.replaceWith(el('div','scene-image-missing','이미지 연결 필요 · '+ref.src))};
  return img;
 }
 function renderCard({scene,text},ctx){
  const card=el('div','scene-fullcard '+((scene.kind==='intro'||scene.kind==='outro')?'dark':'narration'));
  const {title,body}=headingAndText(text);
  const small=el('div','scene-kicker',scene.kind==='intro'?'역사 속 그날':scene.kind==='outro'?'그 후':'역사 기록');
  card.append(small);
  if(title)card.append(rich('h2','scene-bigtitle',title));
  const content=el('div','scene-description');paragraphs(sceneText(body),content);card.append(content);
  const image=markdownImage(text);
  if(image){card.classList.add('with-image');card.prepend(imageElement(image,ctx,'scene-background-image'))}
  if(scene.kind==='narration'){
   const box=el('div','webtoon-narration');
   for(const node of [...card.children])if(!node.classList.contains('scene-background-image'))box.append(node);
   if(box.childNodes.length)card.append(box);
  }
  return card;
 }
 function parseChat(raw){
  const entries=[];
  for(const line of String(raw||'').split(/\r?\n/)){
   const trimmed=line.trim();
   if(!trimmed||trimmed.startsWith('<!--'))continue;
   if(!trimmed.startsWith('- ')){
    const prev=entries[entries.length-1];
    if(prev&&prev.type==='message')prev.text+='\n'+trimmed;
    continue;
   }
   const body=trimmed.slice(2).trim();
   const direct=body.match(/^\[(system|kick|invite|share)\]\s*(.*)$/);
   if(direct){
    const type=direct[1],payload=direct[2];
    if(type==='system')entries.push({type:'system',text:payload});
    else if(type==='share'){
     const match=payload.match(/^(.+?)\s*>\s*(.+)$/);
     if(match)entries.push({type:'share',who:match[1].trim(),target:match[2].trim()});
    }else{
     const match=payload.match(/^(.+?)\s*>\s*(.+)$/);
     entries.push({type:'system',text:match?match[1].trim()+'님이 '+match[2].trim()+'님을 '+(type==='kick'?'내보냈습니다':'초대했습니다'):payload});
    }
    continue;
   }
   const msg=body.match(/^([^:]+):\s*(.*)$/);
   if(msg)entries.push({type:'message',who:msg[1].trim(),text:msg[2]});
  }
  return entries;
 }
 function renderChat({scene,text},ctx){
  const wrap=el('div','studio-chat');
  const header=el('header','studio-chat-head');
  const back=el('span','studio-back'),menu=el('span','studio-menu');back.append(uiIcon('left',20));menu.append(uiIcon('menu',19));
  header.append(back,el('div','studio-room',scene.room||ctx.episode.title),menu);
  const chat=el('div','studio-chat-body');
  const messages=parseChat(text);
  for(let i=0;i<messages.length;i++){
   const m=messages[i],delay=Math.round(200+i*Math.min(360,Math.max(85,(scene.durationMs-300)/Math.max(1,messages.length))));
   if(m.type==='system'){const notice=rich('div','studio-system',m.text);notice.style.animationDelay=delay+'ms';chat.append(notice);continue}
   const row=el('div','studio-chat-row');row.style.animationDelay=delay+'ms';
   row.append(el('div','studio-chat-avatar',m.who.slice(0,1)));
   const content=el('div','studio-chat-message');content.append(el('div','studio-chat-author',m.who));
   if(m.type==='share'){
    const reference=ctx.getSceneContent(m.target);
    const data=headingAndText(reference||'');
    const share=el('div','studio-shared-post');
    share.append(el('div','studio-share-label','공유한 게시물'),el('strong','',data.title||m.target));
    paragraphs(data.body,share);content.append(share);
   }else content.append(rich('div','studio-chat-bubble',m.text));
   row.append(content);chat.append(row);
  }
  wrap.append(header,chat);
  return wrap;
 }
 function renderPost({scene,text},ctx){
  const wrap=el('div','studio-post-wrap');
  const post=el('article','studio-post');
  let data=headingAndText(text), lines=data.body.split('\n');
  let handle='';
  if(lines[0]?.trim().startsWith('@'))handle=lines.shift().trim();
  const who=scene.author&&scene.author!=='작성자'?scene.author:(data.title||'조선 소식');
  const head=el('div','studio-post-head');
  head.append(el('div','studio-post-avatar',who.slice(0,1)));
  const byline=el('div','studio-post-author');byline.append(el('strong','',who),el('span','',handle||'@joseon'));head.append(byline,el('span','studio-post-dots','···'));post.append(head);
  const body=el('div','studio-post-text');paragraphs(sceneText(lines.join('\n')),body);post.append(body);
  const image=markdownImage(text);if(image)post.append(imageElement(image,ctx,'studio-post-image'));
  const actions=el('div','studio-post-actions');for(const name of ['heart','repeat','chat','share'])actions.append(uiIcon(name,17));post.append(actions);wrap.append(post);
  return wrap;
 }
 function renderPhoto({scene,text},ctx){
  const wrap=el('div','studio-photo-wrap');
  const data=headingAndText(text),image=markdownImage(text);
  if(image)wrap.append(imageElement(image,ctx,'studio-photo-image'));
  else wrap.append(el('div','scene-image-missing','이미지 삽입을 기다리는 중'));
  if(data.title)wrap.append(rich('h2','studio-photo-title',data.title));
  if(sceneText(data.body))wrap.append(rich('p','studio-photo-caption',sceneText(data.body)));
  return wrap;
 }
 registry.set('intro',renderCard);registry.set('outro',renderCard);registry.set('narration',renderCard);
 registry.set('chat',renderChat);registry.set('post',renderPost);registry.set('photo',renderPhoto);
 function register(name,renderer){if(!/^[a-z][\w.-]*$/.test(name)||typeof renderer!=='function')throw Error('Invalid scene renderer');registry.set(name,renderer)}
 function render(scene,text,context){
  const type=scene.kind+':'+(scene.variant||'default');
  const renderer=registry.get(type)||registry.get(scene.kind);
  if(!renderer)throw Error('지원하지 않는 장면 유형: '+scene.kind);
  return renderer({scene,text},context);
 }
 global.StudioRenderers=Object.freeze({render,register,parseChat});
})(window);
