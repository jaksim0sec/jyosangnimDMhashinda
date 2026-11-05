/* Episode-specific, reviewed chat overlay. */
(function(global){
 'use strict';
 global.StudioCanvas.register('chat:royal-purge',(ctx,frame,api)=>{
  api.drawDefault(ctx,frame,'chat');
  const entries=global.StudioRenderers.parseChat(frame.text);
  if(!entries.some(e=>e.type==='system'&&e.text.includes('내보냈습니다')))return;
  if(!frame.forceAll&&frame.elapsedMs<frame.scene.durationMs*.4)return;
  const safe=global.StudioCanvas.safeOf(frame.episode),x=12,y=640*safe.top/100+51;
  ctx.save();
  ctx.fillStyle='rgba(108,35,42,.94)';
  ctx.fillRect(x,y,150,28);
  ctx.fillStyle='#fff';
  ctx.font='750 11px "Noto Sans KR",sans-serif';
  ctx.textBaseline='middle';
  ctx.fillText('왕명 · 조정 인사발령',x+10,y+14);
  ctx.restore();
 });
})(window);
