/* Reusable story beats: cinematic text and notification/inbox montages.
 * Both preview and WebM recording use the exact same Canvas renderer.
 * Contents are plain Markdown-ish text, never executable HTML.
 */
(function(global){
 'use strict';
 const W=360,H=640;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const text=(ctx,v,x,y,size=13,color='#182937',bold=false)=>{
   ctx.fillStyle=color;ctx.textBaseline='top';ctx.font=(bold?'750 ':'400 ')+size+'px "Noto Sans KR","Apple SD Gothic Neo",sans-serif';
   ctx.fillText(String(v),x,y);
 };
 const rounded=(ctx,x,y,w,h,r=12)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.closePath()};
 const box=(ctx,x,y,w,h,color,r=12)=>{ctx.fillStyle=color;rounded(ctx,x,y,w,h,r);ctx.fill()};
 function lines(ctx,value,maxWidth,size=13){
   ctx.font='600 '+size+'px "Noto Sans KR",sans-serif';
   const parts=String(value).split('\n'),out=[];
   for(const part of parts){let row='';for(const ch of Array.from(part)){
      if(row&&ctx.measureText(row+ch).width>maxWidth){out.push(row);row=ch}else row+=ch;
   }out.push(row)}
   return out;
 }
 function cinematic(ctx,frame){
   ctx.fillStyle='#08090c';ctx.fillRect(0,0,W,H);
   const heading=String(frame.text||'').split('\n').find(x=>x.trim().startsWith('# '))?.trim().slice(2)||'';
   const width=306;
   const message=lines(ctx,heading,width,25),size=message.length>=3?22:25,lineHeight=size*1.56;
   const y=H*.47-message.length*lineHeight/2;
   for(let i=0;i<message.length;i++){
     const line=message[i];
     ctx.font='700 '+size+'px "Noto Sans KR",sans-serif';
     text(ctx,line,(W-ctx.measureText(line).width)/2,y+i*lineHeight,size,'#fff',true);
   }
 }
 function parse(textBody){
   const lines=String(textBody||'').split(/\r?\n/);
   const headline=lines.find(s=>s.startsWith('# '))?.slice(2).trim()||'조선 알림';
   const narrative=lines.find(s=>s.startsWith('> '))?.slice(2).trim()||'';
   const notices=lines.filter(s=>s.startsWith('- ')).map(s=>{
     const parts=s.slice(2).split('|');
     return {who:(parts.shift()||'알림').trim(),message:parts.join('|').trim()};
   }).filter(s=>s.message);
   return {headline,narrative,notices};
 }
 function notification(ctx,frame,kind){
   const safe=global.StudioCanvas.safeOf(frame.episode);
   const top=H*safe.top/100+7,bottom=H*(100-safe.bottom)/100-12,right=W*safe.right/100;
   const x=14,width=W-x-right-8,duration=Math.max(1,frame.scene.durationMs);
   const t=clamp((frame.forceAll?duration:frame.elapsedMs)/duration,0,1);
   const {headline,narrative,notices}=parse(frame.text);
   ctx.fillStyle='#e8eff5';ctx.fillRect(0,0,W,H);
   // Messenger notifications page rather than another chat room.
   box(ctx,0,top-10,W,76,'#d7e5f1',0);
   text(ctx,'‹',18,top+13,23,'#263949');
   text(ctx,headline,48,top+15,16,'#1b3345',true);
   text(ctx,'알림 · 소식',48,top+42,10,'#668093');
   box(ctx,x,top+84,width,56,'#fff',12);
   box(ctx,x+12,top+95,34,34,'#518fb0',11);
   text(ctx,'!',x+23,top+104,17,'#fff',true);
   text(ctx,'새 알림',x+56,top+94,12,'#324758',true);
   if(kind==='storm'){
      const stages=[3,17,58,142,999],progress=t*4.5,index=Math.min(3,Math.floor(progress));
      const amount=t>=.91?'999+':String(Math.round(stages[index]+(stages[index+1]-stages[index])*clamp(progress-index,0,1)));
      box(ctx,x+width-79,top+102,64,30,'#e05b49',16);
      ctx.font='800 15px "Noto Sans KR",sans-serif';
      text(ctx,amount,x+width-46-ctx.measureText(amount).width/2,top+107,15,'#fff',true);
   }else{
      box(ctx,x+width-54,top+102,39,27,'#e05b49',14);
      text(ctx,String(Math.min(notices.length,9)),x+width-42,top+107,13,'#fff',true);
   }
   let y=top+157;
   notices.forEach((note,i)=>{
      const appear=kind==='storm'?(i*.17+.13):(i*.25+.1);
      const reveal=clamp((t-appear)/.15,0,1);
      if(reveal<=0)return;
      ctx.save();ctx.globalAlpha=reveal;
      const dy=(1-reveal)*11;
      const rows=lines(ctx,note.message,width-70,11.5).slice(0,2);
      const h=53+Math.max(0,rows.length-1)*16;
      box(ctx,x,y+dy,width,h,'#fff',11);
      box(ctx,x+10,y+9+dy,31,31,['#668bba','#a28b74','#778e85','#8e84ab'][i%4],11);
      text(ctx,note.who.slice(0,1),x+20,y+16+dy,13,'#fff',true);
      text(ctx,note.who,x+52,y+9+dy,11.3,'#253d51',true);
      rows.forEach((row,j)=>text(ctx,row,x+52,y+28+dy+j*15,10.7,'#536977'));
      ctx.restore();y+=h+8;
   });
   if(narrative){
     const rows=lines(ctx,narrative,width-26,13.1).slice(0,4);
     const blockH=rows.length*22+21;
     const ny=Math.min(bottom-blockH,Math.max(y+10,bottom-blockH));
     box(ctx,x,ny,width,blockH,'rgba(19,27,35,.94)',1);
     rows.forEach((row,i)=>text(ctx,row,x+12,ny+11+i*22,13.1,'#fff',true));
   }
 }
 global.StudioCanvas.register('intro:cinematic',(ctx,frame)=>cinematic(ctx,frame));
 global.StudioCanvas.register('post:notice-storm',(ctx,frame)=>notification(ctx,frame,'storm'));
 global.StudioCanvas.register('post:notice-inbox',(ctx,frame)=>notification(ctx,frame,'inbox'));
})(window);
