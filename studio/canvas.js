/* Deterministic Studio frame renderer.
 * The SAME 720x1280 canvas powers the editor preview and captured video.
 * All dynamic content is painted as text/images, never interpreted as HTML.
 */
(function(global){
 'use strict';
 const W=360,H=640,DEFAULT_SAFE={top:12,right:17,bottom:21};
 const imageCache=new Map(),tintCache=new Map(),extensions=new Map();
 const fonts={regular:'"Noto Sans KR","Apple SD Gothic Neo",sans-serif',heavy:'"Noto Sans KR","Apple SD Gothic Neo",sans-serif'};
 function clamp(n,min,max){return Math.min(max,Math.max(min,Number(n)||0))}
 function safeOf(episode){
  const v=episode?.settings?.safeArea||{};
  return {top:clamp(v.top??12,0,30),right:clamp(v.right??17,0,29),bottom:clamp(v.bottom??21,0,35)};
 }
 function font(ctx,size=13,bold=false){ctx.font=(bold?'750 ':'400 ')+size+'px '+fonts.regular;ctx.textBaseline='top'}
 function fill(ctx,color,x,y,w,h){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
 function rounded(ctx,x,y,w,h,r=10){
  r=clamp(r,0,Math.min(w,h)/2);ctx.beginPath();ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
 }
 function box(ctx,x,y,w,h,color,r=10){ctx.fillStyle=color;rounded(ctx,x,y,w,h,r);ctx.fill()}
 function rectText(ctx,text,x,y,size=13,color='#17212b',bold=false){
  font(ctx,size,bold);ctx.fillStyle=color;ctx.fillText(String(text),x,y);
 }
 function image(path,resolve){
  if(!path)return null;
  const url=resolve?.(path)||path;
  if(!url)return null;
  const found=imageCache.get(url);
  return found?.status==='loaded'?found.image:null;
 }
 function fetchImage(path,resolve){
  const url=resolve?.(path)||path;
  if(!url)return Promise.resolve(false);
  const previous=imageCache.get(url);
  if(previous)return previous.promise;
  const data={status:'pending',image:null,promise:null};
  data.promise=new Promise(done=>{
   const img=new Image();let settled=false;
   const finish=ok=>{if(settled)return;settled=true;clearTimeout(timeout);data.status=ok?'loaded':'failed';data.image=ok?img:null;done(ok)};
   const timeout=setTimeout(()=>finish(false),8000);
   img.onload=()=>finish(img.naturalWidth>0);
   img.onerror=()=>finish(false);
   if(/^https?:\/\//i.test(url))img.crossOrigin='anonymous';
   img.src=url;
   if(img.complete&&img.naturalWidth)finish(true);
  });
  imageCache.set(url,data);return data.promise;
 }
 function renderImage(ctx,img,x,y,w,h,cover=false,radius=0){
  if(!img?.naturalWidth)return false;
  ctx.save();
  if(radius){rounded(ctx,x,y,w,h,radius);ctx.clip()}
  const sw=w/img.naturalWidth,sh=h/img.naturalHeight,scale=cover?Math.max(sw,sh):Math.min(sw,sh);
  const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
  ctx.restore();return true;
 }
 function parseMarkup(raw){
  const result=[];const exp=/:icon\(([a-z][a-z0-9-]{0,60})\):/g;
  let last=0,found;
  while((found=exp.exec(String(raw)))){
   if(found.index>last)result.push({text:raw.slice(last,found.index)});
   result.push({icon:found[1]});last=exp.lastIndex;
  }
  if(last<String(raw).length)result.push({text:raw.slice(last)});
  return result;
 }
 function tokens(text){
  const arr=[];
  for(const piece of parseMarkup(String(text))){
   if(piece.icon){arr.push({icon:piece.icon});continue}
   for(const glyph of Array.from(piece.text))arr.push({text:glyph});
  }
  return arr;
 }
 function measureLines(ctx,value,maxWidth,size=13,bold=false,maxLines=1000){
  font(ctx,size,bold);
  const rows=[],parts=tokens(value);let line=[],width=0;
  function flush(){rows.push({atoms:line,width});line=[];width=0}
  for(const p of parts){
   if(p.text==='\n'){flush();if(rows.length>=maxLines)break;continue}
   const w=p.icon?size*1.08:ctx.measureText(p.text).width;
   if(width+w>maxWidth&&line.length){flush();if(rows.length>=maxLines)break}
   line.push({...p,width:w});width+=w;
  }
  if(rows.length<maxLines&&(line.length||!rows.length))flush();
  return rows;
 }
 function tintIcon(name,color){
  const k=name+'|'+color;
  if(tintCache.has(k))return tintCache.get(k);
  const icon=imageCache.get('studio-icon:'+name)?.image;
  if(!icon?.naturalWidth)return null;
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,64,64);ctx.drawImage(icon,0,0,64,64);
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
  tintCache.set(k,c);return c;
 }
 function drawLine(ctx,atoms,x,y,size,color,bold=false){
  font(ctx,size,bold);ctx.fillStyle=color;let cursor=x;
  for(const atom of atoms){
   if(atom.icon){
    const symbol=tintIcon(atom.icon,color);
    if(symbol)ctx.drawImage(symbol,cursor,y,size*1.05,size*1.05);
    else ctx.fillText('□',cursor,y);
   }else ctx.fillText(atom.text,cursor,y);
   cursor+=atom.width;
  }
 }
 function textBlock(ctx,raw,x,y,width,{size=13,leading=1.55,color='#182733',bold=false,maxLines=50,align='left'}={}){
  const rows=measureLines(ctx,String(raw||''),width,size,bold,maxLines);
  const height=rows.length*size*leading;
  rows.forEach((line,i)=>{
   let px=x;
   if(align==='center')px=x+(width-line.width)/2;
   if(align==='right')px=x+width-line.width;
   drawLine(ctx,line.atoms,px,y+i*size*leading,size,color,bold);
  });
  return height;
 }
 function textWidth(ctx,value,size=13,bold=false){font(ctx,size,bold);return ctx.measureText(String(value)).width}
 function headerAndBody(text){
  let parts=String(text||'').replace(/\r/g,'').split('\n'),title='';
  if(parts[0]?.trim().startsWith('# '))title=parts.shift().trim().slice(2);
  return {title,body:parts.join('\n').trim()};
 }
 function firstImage(raw){
  const m=String(raw||'').match(/!\[([^\]]*)\]\(([^)\n]+)\)/);
  return m?{path:m[2].trim(),alt:m[1]}:null;
 }
 function withoutImage(raw){return String(raw||'').replace(/!\[[^\]]*\]\([^\)\n]+\)/g,'').trim()}
 function drawBackdrop(ctx,kind,imagePath,resolve){
  const dark=(kind==='intro'||kind==='outro'||kind==='narration');
  fill(ctx,dark?'#171b21':'#f0f3f6',0,0,W,H);
  const photo=image(imagePath,resolve);
  if(photo){
   renderImage(ctx,photo,0,0,W,H,true);
   if(dark)fill(ctx,'rgba(12,16,22,.58)',0,0,W,H);
  }
 }
 function sceneCard(ctx,frame,kind){
  const safe=safeOf(frame.episode),top=H*safe.top/100,bottom=H*(100-safe.bottom)/100;
  const {title,body}=headerAndBody(frame.text),ref=firstImage(frame.text);
  drawBackdrop(ctx,kind,ref?.path,frame.resolveAsset);
  const main=withoutImage(body),isNarration=kind==='narration';
  const gap=14,titleSize=isNarration?22:24;
  const titleHeight=measureLines(ctx,title,300,titleSize,true).length*titleSize*1.42;
  const bodyHeight=measureLines(ctx,main,302,13,false).length*13*1.65;
  const total=titleHeight+(main?gap+bodyHeight:0)+(isNarration?36:0);
  let y=clamp((top+bottom-total)/2,top+8,bottom-110);
  if(isNarration){
   const cardHeight=Math.min(bottom-top-30,total+42);
   box(ctx,19,y-18,322,cardHeight,'rgba(10,13,17,.94)',0);
   ctx.lineWidth=.8;ctx.strokeStyle='#a2a7b0';ctx.strokeRect(19,y-18,322,cardHeight);
   y+=4;
  }
  if(title)y+=textBlock(ctx,title,31,y,298,{size:titleSize,bold:true,color:'#fff',leading:1.42,align:isNarration?'left':'center'});
  if(main)y+=textBlock(ctx,main,31,y+gap,298,{size:13.2,color:'#e5e8ec',leading:1.65,align:isNarration?'left':'center'});
  if(kind==='intro')textBlock(ctx,'조선 · 역사 기반 패러디',35,top+4,290,{size:10,color:'#d3a991',align:'center'});
  if(kind==='outro')textBlock(ctx,'사건의 결말',35,top+4,290,{size:10,color:'#d3a991',align:'center'});
 }
 function chatPerson(frame,who){
  const person=frame.episode?.characters?.[who]||{};
  const name=String(who||'');
  const colors=['#657f91','#89706d','#777992','#738b7b','#8d7b60','#6b7f89'];
  let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
  return {avatar:person.avatar||null,color:person.color||colors[hash%colors.length],mark:person.label||name.slice(0,1)};
 }
 function chatOwn(frame,who){
  return who&&(who===(frame.scene.perspective||frame.episode?.settings?.chatPerspective||'숙종'));
 }
 function drawChatAvatar(ctx,frame,who,x,y){
  const person=chatPerson(frame,who);
  box(ctx,x,y,29,29,person.color,9);
  const avatar=person.avatar&&image(person.avatar,frame.resolveAsset);
  if(avatar)renderImage(ctx,avatar,x,y,29,29,true,9);
  else textBlock(ctx,person.mark,x+1,y+6,27,{size:15,color:'#fff',bold:true,align:'center',maxLines:1});
 }
 function chatLines(ctx,entry,available,frame,previous){
  if(entry.type==='system')return {height:43,entry,rows:measureLines(ctx,entry.text,available-25,10,false,2)};
  const own=!!chatOwn(frame,entry.who),grouped=previous?.who===entry.who&&previous?.type!=='system';
  const above=own||grouped?0:18,after=grouped?6:12;
  let width=221,bh,rows=[];
  if(entry.type==='image'){
   width=own?222:212;
   const img=image(entry.path,frame.resolveAsset);
   bh=img?clamp(width*img.naturalHeight/img.naturalWidth,80,285):172;
  }else if(entry.type==='share'){
   width=220;
   const content=headerAndBody(frame.getSceneContent?.(entry.target)||'');
   const preview=(content.title||entry.target)+'\n'+withoutImage(content.body);
   rows=measureLines(ctx,preview,width-20,12,false,5);
   bh=43+rows.length*17;
  }else{
   rows=measureLines(ctx,entry.text||'',216,12.6,false,20);
   width=clamp(Math.max(35,...rows.map(r=>r.width+22)),39,244);
   if(!own)width=Math.min(width,available-48);
   bh=rows.length*19.3+19;
  }
  return {entry,width,bh,rows,above,after,own,grouped,height:above+bh+after};
 }
 function chat(ctx,frame){
  const safe=safeOf(frame.episode),top=Math.round(H*safe.top/100),right=Math.round(W*safe.right/100),bottom=Math.round(H*(1-safe.bottom/100));
  const chrome=frame.episode?.settings?.chatChrome||'compact';
  const showInput=chrome==='classic';
  const headerY=Math.max(top,22),headerH=55;
  fill(ctx,'#a6bbcf',0,0,W,H);
  // Reuse the legacy player's visual palette and familiar Kakao-style hierarchy.
  fill(ctx,'rgba(255,255,255,.08)',0,headerY,W,headerH);
  fill(ctx,'rgba(34,47,60,.12)',0,headerY+headerH-1,W,1);
  rectText(ctx,'‹',15,headerY+13,24,'#26313b');
  const title=String(frame.scene.room||frame.episode.title||'조선 단톡방');
  const maxTitleWidth=Math.max(145,268-right);
  textBlock(ctx,title,46,headerY+8,maxTitleWidth,{size:14,bold:true,maxLines:1,color:'#17212b'});
  const roster=new Set();
  for(const scene of frame.episode.scenes||[]){
   if(scene.kind!=='chat'||(scene.room||frame.episode.title)!==title)continue;
   for(const m of global.StudioRenderers?.parseChat?.(frame.getSceneContent?.(scene.id)||'')||[])if(m.who)roster.add(m.who);
  }
  rectText(ctx,'참여자 '+(roster.size||2)+'명',46,headerY+39,10,'#627582');
  const chatTop=headerY+headerH+4,chatBottom=bottom-(showInput?49:7);
  const maxRight=Math.max(235,W-right-7),left=12;
  const room=title,scenes=frame.episode?.scenes||[],before=[];
  for(const past of scenes){
   if(past.id===frame.scene.id)break;
   if(past.kind==='chat'&&(past.room||frame.episode.title)===room){
    before.push(...(global.StudioRenderers?.parseChat?.(frame.getSceneContent?.(past.id)||'')||[]));
   }
  }
  const current=global.StudioRenderers?.parseChat?.(frame.text)||[];
  const interval=frame.scene.durationMs/Math.max(1,current.length);
  const played=frame.forceAll?frame.scene.durationMs:frame.elapsedMs;
  let count=frame.forceAll?current.length:Math.min(current.length,Math.max(0,Math.floor((played-130)/interval)+1));
  const visible=[...before,...current.slice(0,count)].slice(-70);
  const boxes=visible.map((entry,i)=>chatLines(ctx,entry,maxRight-12,frame,visible[i-1]));
  const baseY=chatTop+11;
  let vertical=boxes.reduce((v,b)=>v+b.height,0)+16;
  let reveal=1;
  if(!frame.forceAll&&count){
   const timeInto=played-(130+(count-1)*interval);
   reveal=clamp(timeInto/280,0,1);reveal=1-(1-reveal)**3;
  }
  const last=boxes.at(-1);
  const target=Math.max(0,baseY+vertical-chatBottom-(last?last.height*(1-reveal):0));
  let y=baseY-target;
  const canShowTyping=!frame.forceAll&&count<current.length;
  const nextMoment=130+count*interval;
  const typing=canShowTyping&&played>nextMoment-Math.min(560,interval*.47);
  ctx.save();ctx.beginPath();ctx.rect(0,chatTop,W,chatBottom-chatTop);ctx.clip();
  for(let i=0;i<visible.length;i++){
   const b=boxes[i],item=b.entry,opacity=i===boxes.length-1&&count?reveal:1;
   ctx.save();ctx.globalAlpha=clamp(opacity,.01,1);
   const movement=i===boxes.length-1&&count?(1-reveal)*9:0;
   const yy=y+movement;
   if(item.type==='system'){
    const text=item.text||'';
    font(ctx,10);
    const w=clamp(textWidth(ctx,text,10)+24,90,maxRight-15);
    const x=Math.max(10,(maxRight-w)/2+5);
    box(ctx,x,yy+9,w,26,'rgba(48,70,89,.31)',13);
    textBlock(ctx,text,x+10,yy+15,w-20,{size:10,color:'#fff',align:'center',maxLines:1});
   }else{
    const bx=b.own?Math.max(left,maxRight-b.width-4):48,by=yy+b.above;
    if(!b.own&&!b.grouped){
     drawChatAvatar(ctx,frame,item.who,12,yy);
     rectText(ctx,item.who,48,yy+7,10,'#354c5b');
    }
    const bg=b.own?'#ffdc53':'#ffffff';
    box(ctx,bx,by,b.width,b.bh,bg,10);
    // Rounded legacy bubble + subtle depth, not full-width cards.
    ctx.save();ctx.strokeStyle='rgba(30,45,62,.07)';ctx.lineWidth=.6;
    rounded(ctx,bx+.3,by+.3,b.width-.6,b.bh-.6,10);ctx.stroke();ctx.restore();
    if(item.type==='image'){
     const pic=image(item.path,frame.resolveAsset);
     if(pic)renderImage(ctx,pic,bx+3,by+3,b.width-6,b.bh-6,true,8);
     else textBlock(ctx,'사진 미연결',bx+8,by+b.bh/2-8,b.width-16,{size:11,color:'#6e8290',align:'center'});
    }else if(item.type==='share'){
     rectText(ctx,'공유한 게시물',bx+11,by+10,10,'#87929d',true);
     box(ctx,bx+8,by+29,b.width-16,b.bh-36,'#f2f4f6',5);
     let ry=by+36;
     for(const row of b.rows){drawLine(ctx,row.atoms,bx+16,ry,12,'#293540');ry+=17}
    }else{
     let ry=by+12;
     for(const row of b.rows){drawLine(ctx,row.atoms,bx+11,ry,12.6,'#222e37');ry+=19.3}
    }
   }
   ctx.restore();y+=b.height;
  }
  if(typing){
   const next=current[count],own=!!chatOwn(frame,next?.who),x=own?maxRight-56:48;
   box(ctx,x,y+1,50,32,own?'#ffdc53':'#fff',10);
   for(let i=0;i<3;i++){
    const phase=(played/230+i*.65)%3,dy=phase>1&&phase<2?-2:0;
    ctx.beginPath();ctx.arc(x+14+i*11,y+17+dy,2.6,0,Math.PI*2);
    ctx.fillStyle='#9aa8b3';ctx.fill();
   }
  }
  ctx.restore();
  if(showInput){
   fill(ctx,'#fff',0,chatBottom,W,49);
   fill(ctx,'rgba(25,38,51,.08)',0,chatBottom,W,1);
   rectText(ctx,'+',14,chatBottom+12,22,'#929da6');
   box(ctx,42,chatBottom+8,maxRight-48,33,'#f5f6f7',8);
   rectText(ctx,'메시지 입력',53,chatBottom+19,11,'#a1a9af');
  }
 }
 function post(ctx,frame){
  const safe=safeOf(frame.episode),top=H*safe.top/100,bottom=H*(1-safe.bottom/100),body=headerAndBody(frame.text),lines=body.body.split('\n');
  let handle='@joseon';if(lines[0]?.trim().startsWith('@'))handle=lines.shift().trim();
  const raw=withoutImage(lines.join('\n')).trim(),ref=firstImage(frame.text);
  fill(ctx,'#eff2f6',0,0,W,H);
  const name=body.title||'조선 소식';
  const width=308,pad=17;
  const bodyHeight=Math.min(270,Math.max(60,measureLines(ctx,raw,width-2*pad,14,false,12).length*22+12));
  const pic=ref?170:0,cardHeight=Math.min(bottom-top-10,105+bodyHeight+pic);
  const x=26,y=Math.max(top+7,(top+bottom-cardHeight)/2);
  box(ctx,x,y,width,cardHeight,'#fff',16);
  box(ctx,x+pad,y+16,36,36,'#233440',18);
  textBlock(ctx,name.slice(0,1),x+pad+6,y+22,24,{size:18,bold:true,color:'#fff',align:'center'});
  rectText(ctx,name,x+pad+46,y+17,13,'#253743',true);
  rectText(ctx,handle,x+pad+46,y+38,10,'#71818e');
  const visibleHeight=textBlock(ctx,raw,x+pad,y+67,width-pad*2,{size:14,color:'#253543',leading:1.55,maxLines:12});
  const imageTop=y+72+visibleHeight;
  if(ref&&imageTop+pic<y+cardHeight-3){
   const img=image(ref.path,frame.resolveAsset);
   box(ctx,x+pad,imageTop,width-2*pad,pic-12,'#dce3e8',10);
   if(img)renderImage(ctx,img,x+pad,imageTop,width-2*pad,pic-12,true,10);
  }
  const actionY=y+cardHeight-29;
  ctx.strokeStyle='#e8ecf0';ctx.beginPath();ctx.moveTo(x+pad,actionY-7);ctx.lineTo(x+width-pad,actionY-7);ctx.stroke();
  const icons=['heart','repeat','chat','share'];let ix=x+pad+4;
  for(const n of icons){drawIcon(ctx,n,ix,actionY,17,'#728392');ix+=75}
 }
 function drawIcon(ctx,name,x,y,size,color){
  const symbol=tintIcon(name,color);if(symbol)ctx.drawImage(symbol,x,y,size,size);
  else rectText(ctx,'·',x+4,y-4,size,color);
 }
 function photo(ctx,frame){
  const safe=safeOf(frame.episode),top=H*safe.top/100,bottom=H*(1-safe.bottom/100),data=headerAndBody(frame.text),ref=firstImage(frame.text);
  fill(ctx,'#14191e',0,0,W,H);
  const img=ref&&image(ref.path,frame.resolveAsset);
  if(img)renderImage(ctx,img,0,top+5,W,bottom-top-10,false,0);
  else{box(ctx,30,top+60,W-60,bottom-top-120,'#2e3945',12);textBlock(ctx,'사진을 올려주세요',47,H/2-10,W-94,{size:14,color:'#dde4ea',align:'center'})}
  if(data.title)textBlock(ctx,data.title,27,top+14,306,{size:20,bold:true,color:'#fff',align:'center',maxLines:2});
  const caption=withoutImage(data.body);if(caption){
   box(ctx,17,bottom-59,W-34,49,'rgba(9,14,19,.78)',10);
   textBlock(ctx,caption,27,bottom-49,W-54,{size:12.2,color:'#fff',align:'center',maxLines:2});
  }
 }
 function register(key,callback){
  if(!/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/.test(key)||typeof callback!=='function')throw Error('Invalid Studio Canvas variant');
  extensions.set(key,callback);
 }
 function drawDefault(ctx,model,kind=model.scene.kind){
  const drawer={intro:sceneCard,outro:sceneCard,narration:sceneCard,chat,post,photo}[kind];
  if(!drawer)throw Error('Unknown scene type '+kind);
  if(drawer===sceneCard)drawer(ctx,model,kind);else drawer(ctx,model);
 }
 function hasVariant(kind,variant){return extensions.has(kind+':'+variant)||extensions.has(kind)}
 function frame(canvas,model){
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas 2D unsupported');
  const scaleX=canvas.width/W,scaleY=canvas.height/H;ctx.setTransform(scaleX,0,0,scaleY,0,0);ctx.clearRect(0,0,W,H);
  const scene=model.scene;if(!scene)return;
  const kind=scene.kind,variant=kind+':'+(scene.variant||'default');
  const m={...model,elapsedMs:clamp(model.elapsedMs??scene.durationMs,0,scene.durationMs),forceAll:!!model.forceAll};
  const drawer=extensions.get(variant)||extensions.get(kind);
  if(drawer)drawer(ctx,m,{drawDefault});else drawDefault(ctx,m,kind);
  const transition=scene.transition||'cut',elapsed=m.elapsedMs;
  if(transition==='fade'&&elapsed<250){
   ctx.globalAlpha=(250-elapsed)/250;fill(ctx,'#151a20',0,0,W,H);ctx.globalAlpha=1;
  }
 }
 function collectRefs(episode,contents){
  const refs=new Set(),icons=new Set();
  for(const scene of episode.scenes||[]){
   const text=String(contents[scene.id]||'');
   for(const match of text.matchAll(/!\[[^\]]*\]\(([^)\n]+)\)/g))refs.add(match[1].trim());
   for(const msg of global.StudioRenderers?.parseChat?.(text)||[])if(msg.type==='image')refs.add(msg.path);
   for(const match of text.matchAll(/:icon\(([a-z][a-z0-9-]*)\):/g))icons.add(match[1]);
  }
  for(const name of ['heart','repeat','chat','share','left','menu'])icons.add(name);
  return {images:[...refs],icons:[...icons]};
 }
 async function preload(episode,contents,resolve){
  const refs=collectRefs(episode,contents);
  const tasks=refs.images.map(p=>fetchImage(p,resolve).then(ok=>({path:p,ok})));
  const allIcons=global.StudioIcons?.list()||[];
  for(const name of refs.icons)if(allIcons.includes(name)){
   const key='studio-icon:'+name;
   if(!imageCache.has(key)){
    const url=new URL('studio/icons/svg/'+name+'.svg',document.baseURI).href;
    // Load the named SVG once, preserving its source bytes.
    imageCache.set(key,{status:'pending',promise:fetchImage(url,()=>url)});
    const entry=imageCache.get(key);
    entry.promise=fetchImage(url,()=>url).then(ok=>{
     const original=imageCache.get(url);
     entry.status=ok?'loaded':'failed';entry.image=original?.image||null;
     return {path:name,ok};
    });
   }
   tasks.push(imageCache.get(key).promise);
  }
  const result=await Promise.all(tasks);
  return result.filter(x=>x&&!x.ok).map(x=>x.path);
 }
 function clear(){imageCache.clear();tintCache.clear()}
 global.StudioCanvas=Object.freeze({frame,preload,register,hasVariant,drawDefault,clear,safeOf,parseMarkup,measureLines,collectRefs});
})(window);