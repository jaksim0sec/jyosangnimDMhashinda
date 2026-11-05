/* Story Studio v0.1 — GitHub-published episodes + per-episode local drafts.
 * Deliberately separate from the legacy chat recorder to avoid breaking it.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),DRAFT='josa-studio:v1:draft:',LOCAL_INDEX='josa-studio:v1:local-episodes';
 const KINDS=['intro','chat','post','narration','photo','outro'];
 const KIND_NAME={intro:'인트로',chat:'단톡',post:'SNS 게시물',narration:'나레이션',photo:'사진',outro:'결말'};
 const KIND_ICON={intro:'play',chat:'chat',post:'share',narration:'book',photo:'grid',outro:'flag'};
 const DEFAULT_TEXT={
  intro:'# 새로운 이야기\n\n사건이 시작됩니다.',
  chat:'- 숙종: 잠깐만요\n- 신하: ?',
  post:'# 숙종\n@royal_official\n\n전하의 발표가 도착했습니다.',
  narration:'# 사건의 전말\n\n그때 조정에서는 중요한 변화가 일어났다.',
  photo:'# 인증 사진\n\n![사진](assets/photo.png)',
  outro:'# 결국\n\n역사는 이렇게 흘러갔다.'
 };
 const state={manifest:[],localIndex:[],id:null,base:null,episode:null,contents:{},baseContents:{},activeId:null,dirty:false,unsaved:false,loading:false,assets:new Map(),db:null,saveTimer:null};
 const player={playing:false,index:0,elapsed:0,lastAt:0,raf:0};
 const video={recording:null,preparing:false,lastUrl:null};
 function error(message){$('error').textContent=message||''}
 function setStatus(value,saved=false){$('saveState').textContent=value;$('saveState').classList.toggle('saved',saved)}
 function key(id){return DRAFT+id}
 function clone(value){return JSON.parse(JSON.stringify(value))}
 function readLocal(key,fallback=null){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}catch(_){return fallback}}
 function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){error('브라우저 저장 실패: '+e.message);return false}}
 function fmt(ms){let s=Math.round(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
 function totalDuration(){return (state.episode?.scenes||[]).reduce((v,s)=>v+(Number(s.durationMs)||0),0)}
 function findScene(id){return state.episode?.scenes.find(s=>s.id===id)||null}
 function activeScene(){return findScene(state.activeId)}
 function localEpisodes(){return (readLocal(LOCAL_INDEX,[])||[]).filter(x=>x?.id&&x?.title)}
 function allEpisodes(){return [...state.manifest,...state.localIndex.filter(l=>!state.manifest.some(e=>e.id===l.id))]}
 function selectOptions(){
  const select=$('episodeSelect'),previous=state.id;
  select.replaceChildren();
  for(const item of allEpisodes())select.add(new Option(item.title+(item.source?'':' · 로컬'),item.id));
  if(previous)select.value=previous;
 }
 function pathFor(src,base){
  const value=String(src||'').trim();
  if(!value||value.startsWith('/')||value.split('/').includes('..')||value.includes('\\')||/^[a-z]+:/i.test(value))throw Error('잘못된 리소스 경로: '+value);
  const url=new URL(value,base);
  if(url.origin!==location.origin)throw Error('외부 에피소드 리소스 사용 불가');
  return url.toString();
 }
 async function getJson(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error('가져오기 실패: '+r.status+' · '+url);return r.json()}
 async function getText(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error('장면 파일 오류: '+r.status+' · '+url);return r.text()}
 function validId(id){return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)}
 function normalizeScenes(ep){
  if(!Array.isArray(ep.scenes))throw Error('에피소드 타임라인이 없음');
  const ids=new Set();
  for(const scene of ep.scenes){
   if(!scene.id||ids.has(scene.id))throw Error('중복/누락된 장면 ID: '+scene.id);
   ids.add(scene.id);
   if(!KINDS.includes(scene.kind))throw Error('지원하지 않는 장면 유형: '+scene.kind);
   scene.durationMs=Math.round(Number(scene.durationMs)||2000);
   if(scene.durationMs<200||scene.durationMs>60000)throw Error('장면 시간은 200~60000ms');
   if(!['cut','fade'].includes(scene.transition))scene.transition='cut';
  }
 }
 async function fetchBaseline(id){
  const item=state.manifest.find(e=>e.id===id);
  if(!item){
   const draft=readLocal(key(id));
   if(!draft?.episode)throw Error('로컬 에피소드 정보를 찾지 못함');
   return {episode:clone(draft.episode),contents:clone(draft.contents||{}),baseUrl:document.baseURI,remote:false};
  }
  const src=pathFor(item.source,document.baseURI),baseUrl=new URL('./',src).toString();
  const episode=await getJson(src);
  if(episode.id!==id||!validId(episode.id))throw Error('에피소드 ID가 일치하지 않음');
  normalizeScenes(episode);
  const entries=await Promise.all(episode.scenes.map(async scene=>[scene.id,scene.src?await getText(pathFor(scene.src,baseUrl)):DEFAULT_TEXT[scene.kind]]));
  return {episode,contents:Object.fromEntries(entries),baseUrl,remote:true};
 }
 function loadDb(){return new Promise(resolve=>{
  try{
   if(!('indexedDB' in window))return resolve(null);
   const q=indexedDB.open('josa-studio-assets-v1',1);
   q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('assets'))q.result.createObjectStore('assets',{keyPath:'key'})};
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);
  }catch(_){resolve(null)}
 })}
 async function assetRows(id){
  if(!state.db)return [];
  return new Promise(resolve=>{
   try{
    const req=state.db.transaction('assets','readonly').objectStore('assets').getAll();
    req.onsuccess=()=>resolve((req.result||[]).filter(x=>x.episodeId===id));
    req.onerror=()=>resolve([]);
   }catch(_){resolve([])}
  });
 }
 async function putAsset(episodeId,path,blob){
  if(!state.db)throw Error('브라우저 이미지 저장소를 사용할 수 없음');
  return new Promise((resolve,reject)=>{
   try{
    const tx=state.db.transaction('assets','readwrite');
    tx.objectStore('assets').put({key:episodeId+'|'+path,episodeId,path,blob});
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||Error('이미지 저장 실패'));
   }catch(e){reject(e)}
  });
 }
 function clearAssetURLs(){for(const url of state.assets.values())URL.revokeObjectURL(url);state.assets.clear()}
 async function loadAssets(id){
  clearAssetURLs();
  window.StudioCanvas?.clear();
  for(const row of await assetRows(id))state.assets.set(row.path,URL.createObjectURL(row.blob));
  renderMediaGallery();
 }
 function resolveAsset(ref){
  const value=String(ref||'').trim();
  if(/^https?:\/\//i.test(value))return value;
  if(!value||value.includes('..')||value.includes('\\')||value.startsWith('/'))return '';
  return state.assets.get(value)||(() => {try{return pathFor(value,state.base?.baseUrl||document.baseURI)}catch(_){return ''}})();
 }
 async function switchEpisode(id){
  if(state.loading||!id)return;
  stopPlayer();state.loading=true;$('episodeSelect').disabled=true;error('');
  try{
   const baseline=await fetchBaseline(id);
   state.id=id;state.base=baseline;state.baseContents=clone(baseline.contents);
   const draft=readLocal(key(id));
   state.episode=draft?.episode?.id===id?clone(draft.episode):clone(baseline.episode);
   state.contents=draft?.episode?.id===id?clone(draft.contents||{}):clone(baseline.contents);
   normalizeScenes(state.episode);
   state.activeId=state.episode.scenes[0]?.id||null;
   state.dirty=!!draft;state.unsaved=false;
   $('episodeTitle').value=state.episode.title;
   await loadAssets(id);
   player.index=0;player.elapsed=0;syncSafeSettings();
   const missing=await window.StudioCanvas.preload(state.episode,state.contents,resolveAsset);
   if(missing.length)error('이미지 '+missing.length+'개를 불러오지 못했습니다. 사진을 연결해 주세요.');
   selectOptions();renderTimeline();editScene(state.activeId);updateStage(activeScene());
   const outdated=baseline.remote&&draft&&Number(draft.baseVersion)!==Number(baseline.episode.version);
   setStatus(outdated?'GitHub 갱신됨 · 기존 로컬 초안 유지':draft?'로컬 초안 · '+new Date(draft.savedAt||Date.now()).toLocaleTimeString():'GitHub 배포본',!!draft);
   $('resetBtn').disabled=!baseline.remote;
  }catch(e){error(e.message);setStatus('불러오기 실패')}
  finally{state.loading=false;$('episodeSelect').disabled=false}
 }
 function snapshot(){
  return {schema:1,episodeId:state.id,savedAt:new Date().toISOString(),baseVersion:state.base?.episode?.version||0,episode:clone(state.episode),contents:clone(state.contents)};
 }
 function saveDraft(){
  if(!state.episode)return false;
  const draft=snapshot();
  if(writeLocal(key(state.id),draft)){state.dirty=true;state.unsaved=false;setStatus('초안 저장됨 · '+new Date().toLocaleTimeString(),true);return true}
  setStatus('저장 실패');return false;
 }
 function scheduleSave(){
  state.unsaved=true;setStatus('수정됨 · 저장 중');
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>saveDraft(),250);
 }
 function immediateSave(){clearTimeout(state.saveTimer);return saveDraft()}
 function sceneLabel(scene){return (KIND_NAME[scene.kind]||scene.kind)+' · '+(scene.id||'')}
 function syncSafeSettings(){
  if(!state.episode)return;
  const values=window.StudioCanvas.safeOf(state.episode),guide=$('guides');
  for(const [id,value] of [['safeTop',values.top],['safeRight',values.right],['safeBottom',values.bottom]])$(id).value=String(value);
  guide.style.setProperty('--guide-top',values.top+'%');
  guide.style.setProperty('--guide-right',values.right+'%');
  guide.style.setProperty('--guide-bottom',values.bottom+'%');
 }
 function updateSafeSetting(name,value){
  if(!state.episode||video.recording)return;
  const allowed={top:30,right:29,bottom:35},number=Math.round(Number(value));
  if(!Number.isFinite(number)||number<0||number>allowed[name])return;
  state.episode.settings??={};
  state.episode.settings.safeArea??={};
  state.episode.settings.safeArea[name]=number;
  syncSafeSettings();scheduleSave();drawFrame();
 }
 function renderTimeline(){
  const host=$('timeline');host.replaceChildren();
  const list=state.episode?.scenes||[];
  list.forEach((scene,i)=>{
   const row=document.createElement('div');row.className='scene-item'+(state.activeId===scene.id?' selected':'');
   const mark=document.createElement('span');mark.className='scene-icon';
   const iconName=KIND_ICON[scene.kind];if(window.StudioIcons?.has(iconName))mark.append(window.StudioIcons.icon(iconName,{size:20}));else mark.textContent='□';
   const button=document.createElement('button');button.type='button';button.className='scene-name';button.style.cssText='border:0;background:none;text-align:left;cursor:pointer';
   button.append(Object.assign(document.createElement('strong'),{textContent:scene.id}),Object.assign(document.createElement('small'),{textContent:KIND_NAME[scene.kind]+' · '+(scene.durationMs/1000).toFixed(1)+'초'}));
   button.addEventListener('click',()=>selectScene(scene.id));
   const up=document.createElement('button');up.className='mini';up.type='button';up.textContent='↑';up.title='앞으로';up.disabled=i===0;
   up.addEventListener('click',()=>moveScene(scene.id,-1));
   const down=document.createElement('button');down.className='mini';down.type='button';down.textContent='↓';down.title='뒤로';down.disabled=i===list.length-1;
   down.addEventListener('click',()=>moveScene(scene.id,1));
   const del=document.createElement('button');del.className='mini';del.type='button';del.textContent='×';del.title='장면 삭제';
   del.addEventListener('click',()=>deleteScene(scene.id));
   row.append(mark,button,up,down,del);host.append(row);
  });
  $('scenePosition').textContent=list.length+'개 장면 · 총 '+fmt(totalDuration());
 }
 function stopPlayer(){
  player.playing=false;player.lastAt=0;
  if(player.raf)cancelAnimationFrame(player.raf);
  player.raf=0;$('playBtn').textContent='▶ 재생';
 }
 function drawFrame(forceAll=!player.playing){
  const scene=state.episode?.scenes[player.index]||activeScene();
  if(!scene)return;
  try{
   window.StudioCanvas.frame($('videoCanvas'),{
    scene,text:state.contents[scene.id]||'',episode:state.episode,
    elapsedMs:forceAll?scene.durationMs:player.elapsed,forceAll,
    resolveAsset,getSceneContent:id=>state.contents[id]||''
   });
  }catch(e){error('영상 렌더링 오류: '+e.message);if(video.recording)stopRecording(true)}
 }
 async function preloadScenes(){
  if(!state.episode)return [];
  const missing=await window.StudioCanvas.preload(state.episode,state.contents,resolveAsset);
  drawFrame();return missing;
 }

 function setProgress(){
  if(!state.episode)return;
  const list=state.episode.scenes,total=Math.max(1,totalDuration());
  const prior=list.slice(0,player.index).reduce((sum,scene)=>sum+scene.durationMs,0);
  const elapsed=Math.min(total,prior+player.elapsed);
  $('progressFill').style.width=(100*elapsed/total).toFixed(2)+'%';
  $('seek').value=String(Math.round(elapsed/total*1000));
  $('previewTime').textContent=fmt(elapsed)+' / '+fmt(total);
 }
 function updateStage(scene){
  const host=$('sceneContainer');host.replaceChildren();host.className='scene';
  if(!scene){host.append(document.createTextNode('장면을 선택해 주세요'));const ctx=$('videoCanvas').getContext('2d');ctx.clearRect(0,0,720,1280);setProgress();return}
  const context={episode:state.episode,resolveAsset,getSceneContent:id=>state.contents[id]||''};
  try{host.append(window.StudioRenderers.render(scene,state.contents[scene.id]||'',context))}
  catch(e){error('미리보기 오류: '+e.message)}
  if(scene.transition==='fade')host.classList.add('is-fading');
  drawFrame();setProgress();
 }
 function selectScene(id,fromPlayer=false){
  if(!fromPlayer)stopPlayer();
  const scene=findScene(id);if(!scene)return;
  state.activeId=id;player.index=state.episode.scenes.findIndex(s=>s.id===id);player.elapsed=0;
  renderTimeline();editScene(id);updateStage(scene);
 }
 function editScene(id){
  const scene=findScene(id),disabled=!scene;
  for(const field of ['sceneKind','duration','sceneVariant','transition','sceneRoom','sceneContent','uploadImageBtn'])$(field).disabled=disabled;
  $('sceneId').value=scene?.id||'';$('sceneContent').value=scene?state.contents[scene.id]||'':'';
  $('editingHeading').textContent=scene?KIND_NAME[scene.kind]+' 편집':'장면을 선택하세요';
  if(scene){
   $('sceneKind').value=scene.kind;$('duration').value=+(scene.durationMs/1000).toFixed(1);
   $('sceneVariant').value=scene.variant&&[...$('sceneVariant').options].some(o=>o.value===scene.variant)?scene.variant:'';
   $('transition').value=scene.transition||'cut';$('sceneRoom').value=scene.room||'';
  }
 }
 function moveScene(id,delta){
  if(player.playing)stopPlayer();
  const arr=state.episode.scenes,i=arr.findIndex(s=>s.id===id),j=i+delta;
  if(i<0||j<0||j>=arr.length)return;
  [arr[i],arr[j]]=[arr[j],arr[i]];scheduleSave();selectScene(id);
 }
 function deleteScene(id){
  stopPlayer();
  const target=findScene(id);
  if(!target||!confirm('장면 '+id+'을 삭제할까요?'))return;
  state.episode.scenes=state.episode.scenes.filter(s=>s.id!==id);
  delete state.contents[id];state.activeId=state.episode.scenes[0]?.id||null;
  scheduleSave();renderTimeline();editScene(state.activeId);
  if(state.activeId)selectScene(state.activeId);else updateStage(null);
 }
 function addScene(){
  stopPlayer();const kind=$('newKind').value;
  if(!KINDS.includes(kind))return;
  const id=kind+'-'+Date.now().toString(36);
  const variant={chat:'kakao',narration:'webtoon',post:'social',intro:'dark',outro:'dark'}[kind]||'';
  const scene={id,kind,src:null,durationMs:kind==='chat'?4500:2300,transition:'fade',variant};
  state.episode.scenes.push(scene);state.contents[id]=DEFAULT_TEXT[kind]||'';
  scheduleSave();selectScene(id);
 }
 function changeField(field,value){
  const scene=activeScene();if(!scene||player.playing)return;
  if(field==='kind'&&KINDS.includes(value)){
   scene.kind=value;
   scene.variant={chat:'kakao',narration:'webtoon',post:'social',intro:'dark',outro:'dark'}[value]||'';
  }else if(field==='durationMs'){
   const v=Math.round(Number(value)*1000);if(!Number.isFinite(v))return;
   scene.durationMs=Math.max(200,Math.min(60000,v));
  }else if(field==='transition'){
   scene.transition=value==='fade'?'fade':'cut';
  }else if(field==='variant'){
   scene.variant=value;
  }else if(field==='room'){
   scene.room=value.slice(0,100);
  }
  scheduleSave();renderTimeline();updateStage(scene);
 }
 function frame(now){
  if(!player.playing)return;
  if(player.lastAt)player.elapsed+=Math.min(200,Math.max(0,now-player.lastAt));
  player.lastAt=now;
  let current=state.episode.scenes[player.index];
  while(current&&player.elapsed>=current.durationMs){
   player.elapsed-=current.durationMs;player.index++;
   current=state.episode.scenes[player.index];
   if(!current){
    stopPlayer();player.index=state.episode.scenes.length-1;player.elapsed=state.episode.scenes.at(-1)?.durationMs||0;drawFrame(true);setProgress();
    if(video.recording)stopRecording(false);
    return;
   }
   state.activeId=current.id;renderTimeline();editScene(current.id);updateStage(current);
  }
  drawFrame(false);setProgress();player.raf=requestAnimationFrame(frame);
 }
 function seekTime(fraction){
  if(!state.episode?.scenes.length||video.recording||video.preparing)return;
  stopPlayer();
  const scenes=state.episode.scenes,total=totalDuration(),target=clampSeek(Number(fraction))*total;
  let sum=0,index=scenes.length-1;
  for(let i=0;i<scenes.length;i++){
   if(target<sum+scenes[i].durationMs){index=i;break}
   sum+=scenes[i].durationMs;
  }
  const scene=scenes[index];
  player.index=index;player.elapsed=Math.max(0,Math.min(scene.durationMs,target-sum));
  state.activeId=scene.id;renderTimeline();editScene(scene.id);updateStage(scene);
  drawFrame(false);setProgress();
 }
 function clampSeek(n){return Math.max(0,Math.min(1,Number.isFinite(n)?n:0))}
 function togglePlayback(){
  if(video.recording||video.preparing)return;
  const scenes=state.episode?.scenes||[];
  if(!scenes.length)return;
  if(player.playing){stopPlayer();return}
  player.playing=true;player.lastAt=0;
  if(player.index>=scenes.length)player.index=0;
  if(player.elapsed>=scenes[player.index].durationMs){player.index=0;player.elapsed=0}
  $('playBtn').textContent='Ⅱ 정지';player.raf=requestAnimationFrame(frame);
 }
 function recordingUI(active){
  for(const id of ['episodeSelect','newEpisodeBtn','resetBtn','addSceneBtn','newKind','episodeTitle','sceneKind','duration','sceneVariant','transition','sceneRoom','sceneContent','uploadImageBtn','saveBtn','importBtn','importZipBtn','exportBtn','playBtn','safeTop','safeRight','safeBottom']){
   const elem=$(id);if(elem)elem.disabled=active;
  }
  $('recordBtn').disabled=false;
  $('recordBtn').textContent=active?'■ 녹화 중지':'● 녹화';
  $('recordBtn').classList.toggle('recording',active);
  $('recordBtn').setAttribute('aria-pressed',active?'true':'false');
 }
 async function startRecording(){
  if(video.recording||video.preparing)return;
  if(!window.MediaRecorder||!$('videoCanvas').captureStream){error('이 브라우저는 Canvas 영상 녹화를 지원하지 않음');return}
  if(!state.episode?.scenes.length){error('녹화할 장면이 없음');return}
  video.preparing=true;$('recordBtn').disabled=true;
  $('recordHelp').textContent='장면 이미지 준비 중…';
  try{
   const missing=await preloadScenes();
   if(missing.length)error('이미지 '+missing.join(', ')+'을 찾지 못해 빈자리로 녹화됨');
   stopPlayer();player.index=0;player.elapsed=0;player.lastAt=0;
   const canvas=$('videoCanvas');drawFrame(false);
   const stream=canvas.captureStream(30);
   const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
   const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
   if(!mimeType){stream.getTracks().forEach(t=>t.stop());throw Error('WebM 비디오 코덱을 지원하지 않음')}
   let recorder;
   try{recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3600000})}
   catch(e){stream.getTracks().forEach(t=>t.stop());throw e}
   const current={recorder,stream,mimeType,chunks:[],startedAt:0,endedAt:null,failed:false,missing,finishing:false};
   video.recording=current;
   recorder.ondataavailable=e=>{if(e.data?.size)current.chunks.push(e.data)};
   recorder.onerror=e=>{current.failed=true;error('녹화 오류: '+(e.error?.message||'알 수 없는 오류'));stopRecording(true)};
   recorder.onstop=async()=>{
    try{
     const original=new Blob(current.chunks,{type:current.mimeType});
     if(original.size<1000||current.failed)throw Error('영상이 정상적으로 기록되지 않음');
     const ms=Math.max(1,Math.round((current.endedAt??performance.now())-current.startedAt));
     const result=await window.StudioWebM.fixDuration(original,ms);
     const file=result.blob;
     if(video.lastUrl)URL.revokeObjectURL(video.lastUrl);
     video.lastUrl=URL.createObjectURL(file);
     const a=$('recordDownload');a.href=video.lastUrl;
     a.download=state.id+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm';
     a.classList.remove('hidden');a.click();
     $('recordHelp').textContent='녹화 완료 · '+(ms/1000).toFixed(1)+'초 · '+(file.size/1024/1024).toFixed(1)+' MB · '+(result.ok?'길이 정보 보정됨':'길이 정보 미확인');
     if(!result.ok)error('길이 메타데이터 보정 불가: '+result.note);
    }catch(e){
     error('영상 저장 실패: '+e.message);$('recordHelp').textContent='영상 저장 실패';
    }finally{
     current.stream.getTracks().forEach(t=>t.stop());
     if(video.recording===current)video.recording=null;
     video.preparing=false;recordingUI(false);drawFrame(true);
    }
   };
   recorder.start(250);current.startedAt=performance.now();
   video.preparing=false;recordingUI(true);
   $('recordDownload').classList.add('hidden');
   $('recordHelp').textContent='● 녹화 중 · '+fmt(totalDuration())+'분량 · 끝나면 자동 저장';
   player.playing=true;player.lastAt=0;player.raf=requestAnimationFrame(frame);
  }catch(e){
   video.preparing=false;video.recording=null;$('recordBtn').disabled=false;
   recordingUI(false);error('녹화 시작 실패: '+e.message);
   $('recordHelp').textContent='녹화할 수 없음 · 브라우저와 이미지 확인';
  }
 }
 function stopRecording(manual=true){
  const current=video.recording;if(!current||current.finishing)return;
  current.finishing=true;if(current.endedAt===null)current.endedAt=performance.now();
  stopPlayer();
  const recorder=current.recorder;
  $('recordHelp').textContent='영상 저장 중…';
  $('recordBtn').disabled=true;
  if(recorder.state!=='inactive'){
   try{recorder.requestData()}catch(_){}
   try{recorder.stop()}catch(e){error('녹화 종료 실패: '+e.message)}
  }
  if(manual)drawFrame(true);
 }
 function recordClick(){
  if(video.recording)stopRecording(true);
  else startRecording();
 }
 function download(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
 }
 function safeName(name){return String(name).replace(/[^a-zA-Z0-9._가-힣-]/g,'_').replace(/^\.+/,'').slice(0,100)||'image.png'}
 function renderMediaGallery(){
  const host=$('mediaGrid');host.replaceChildren();
  $('mediaCount').textContent=state.assets.size+'개 · 이 에피소드 전용';
  if(!state.assets.size){
   const note=document.createElement('p');note.className='hint';note.textContent='업로드한 사진이 아직 없음';
   host.append(note);return;
  }
  for(const [path,url] of state.assets){
   const card=document.createElement('div');card.className='media-card';
   const img=document.createElement('img');img.src=url;img.alt=path;img.loading='lazy';
   const name=document.createElement('span');name.className='media-name';name.textContent=path.split('/').pop();name.title=path;
   const insert=document.createElement('button');insert.type='button';insert.textContent='장면에 추가';
   insert.disabled=!!video.recording;insert.addEventListener('click',()=>insertMedia(path));
   const remove=document.createElement('button');remove.type='button';remove.className='media-remove';remove.textContent='삭제';
   remove.disabled=!!video.recording;remove.addEventListener('click',()=>deleteMedia(path));
   card.append(img,name,insert,remove);host.append(card);
  }
 }
 function insertMedia(path){
  const scene=activeScene();if(!scene||video.recording){error('장면을 선택한 뒤 사진을 삽입해 주세요');return}
  const field=$('sceneContent'),start=field.selectionStart??field.value.length,end=field.selectionEnd??start;
  let item='![사진]('+path+')';
  if(scene.kind==='chat'){
   const chat=window.StudioRenderers.parseChat(field.value);
   const previous=[...chat].reverse().find(msg=>msg.who)?.who||'숙종';
   item='- [image] '+previous+' > '+path;
   if(start>0&&!field.value.slice(0,start).endsWith('\n'))item='\n'+item;
  }
  field.setRangeText(item,start,end,'end');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
 }
 function deleteMedia(path){
  if(video.recording)return;
  const referenced=Object.values(state.contents).some(text=>text.includes(path));
  if(!confirm(referenced?'이 사진을 사용하는 장면이 있음. 이미지를 삭제하면 해당 장면에 빈자리가 표시됩니다. 삭제할까요?':'이 에피소드의 사진을 삭제할까요?'))return;
  if(!state.db){error('이미지 저장소를 사용할 수 없음');return}
  const tx=state.db.transaction('assets','readwrite');
  tx.objectStore('assets').delete({key:state.id+'|'+path}.key);
  tx.oncomplete=()=>{
   const url=state.assets.get(path);if(url)URL.revokeObjectURL(url);
   state.assets.delete(path);window.StudioCanvas.clear();renderMediaGallery();preloadScenes();
  };
  tx.onerror=()=>error('사진 삭제 실패: '+(tx.error?.message||'DB 오류'));
 }
 async function storeAssetBatch(episodeId,records){
  if(!records.length)return;
  if(!state.db)throw Error('이미지 저장소 IndexedDB를 사용할 수 없음');
  return new Promise((resolve,reject)=>{
   const tx=state.db.transaction('assets','readwrite');
   const store=tx.objectStore('assets');
   for(const record of records)store.put({key:episodeId+'|'+record.path,episodeId,path:record.path,blob:record.blob});
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||Error('이미지 일괄 저장 실패'));
   tx.onabort=()=>reject(tx.error||Error('이미지 저장 취소'));
  });
 }
 async function uploadImage(file){
  if(!file||!file.type.startsWith('image/'))throw Error('이미지 파일만 업로드 가능');
  if(file.size>25*1024*1024)throw Error('이미지는 25MB 이하만 지원');
  const scene=activeScene();if(!scene)throw Error('장면을 먼저 추가해 주세요');
  const name=safeName(file.name),dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  let path='assets/'+name,n=1;
  while(state.assets.has(path)){n++;path='assets/'+stem+'-'+n+ext}
  await putAsset(state.id,path,file);
  const old=state.assets.get(path);if(old)URL.revokeObjectURL(old);
  state.assets.set(path,URL.createObjectURL(file));
  renderMediaGallery();insertMedia(path);
  await preloadScenes();
 }
 async function exportReview(){
  if(!state.episode)return;
  immediateSave();
  const episode=clone(state.episode),folder='episodes/'+state.id+'/';
  episode.scenes.forEach(scene=>{if(!scene.src)scene.src='scenes/'+safeName(scene.id)+(scene.kind==='chat'?'.chat':'.md')});
  const files=[{path:folder+'episode.json',data:JSON.stringify(episode,null,2)+'\n'}];
  for(const scene of episode.scenes)files.push({path:folder+scene.src,data:(state.contents[scene.id]||'')+'\n'});
  const assetList=await assetRows(state.id);
  for(const a of assetList)files.push({path:folder+a.path,data:a.blob});
  const review={schema:1,type:'studio-review',episodeId:state.id,baseVersion:state.base?.episode?.version||0,exportedAt:new Date().toISOString(),sceneCount:episode.scenes.length,assetCount:assetList.length,note:'GitHub에 반영하려면 에피소드 폴더 변경사항을 검토하고 episodes/manifest.json을 확인하세요'};
  files.push({path:'studio-review.json',data:JSON.stringify(review,null,2)+'\n'});
  files.push({path:'studio-draft.json',data:JSON.stringify(snapshot(),null,2)+'\n'});
  if(!state.manifest.some(e=>e.id===state.id)){
   const entry={id:state.id,title:episode.title,description:episode.description||'',source:folder+'episode.json',status:'draft'};
   files.push({path:'manifest-entry.json',data:JSON.stringify(entry,null,2)+'\n'});
  }
  try{
   const zip=await window.StudioZip.build(files);
   download(zip,state.id+'-review.zip');
   setStatus('검수 ZIP 내보내기 완료',true);
  }catch(e){error('검수 ZIP 생성 실패: '+e.message)}
 }
 async function newEpisode(){
  const name=prompt('새 에피소드 제목을 입력해 주세요');if(!name?.trim())return;
  const id='episode-'+Date.now().toString(36);
  const episode={schema:1,id,title:name.trim().slice(0,100),description:'',version:0,settings:{aspectRatio:'9:16',safeArea:{top:12,right:17,bottom:21}},scenes:[{id:'intro',kind:'intro',src:null,durationMs:2300,transition:'fade',variant:'dark'}]};
  const draft={schema:1,episodeId:id,savedAt:new Date().toISOString(),baseVersion:0,episode,contents:{intro:'# '+episode.title+'\n\n'}};
  if(!writeLocal(key(id),draft))return;
  state.localIndex.push({id,title:episode.title});writeLocal(LOCAL_INDEX,state.localIndex);
  selectOptions();await switchEpisode(id);
 }
 async function resetDraft(){
  if(!state.base?.remote)return;
  if(!confirm('이 에피소드의 로컬 수정본을 지우고 GitHub 배포본으로 되돌릴까요? 다른 에피소드는 유지됩니다.'))return;
  clearTimeout(state.saveTimer);
  localStorage.removeItem(key(state.id));
  await switchEpisode(state.id);
 }
 async function importReview(file){
  if(!file)return;
  try{
   const data=JSON.parse(await file.text());
   if(data.episodeId!==state.id||!data.episode||!data.contents)throw Error('현재 에피소드의 Studio JSON 초안이 아님');
   normalizeScenes(data.episode);
   state.episode=clone(data.episode);state.contents=clone(data.contents);
   immediateSave();$('episodeTitle').value=state.episode.title;
   state.activeId=state.episode.scenes[0]?.id||null;syncSafeSettings();renderTimeline();editScene(state.activeId);selectScene(state.activeId);
  }catch(e){error('가져오기 실패: '+e.message)}
 }
 function insertIconToken(name){
  const scene=activeScene();
  if(!scene){error('장면을 선택한 다음 아이콘을 삽입해 주세요');return}
  const area=$('sceneContent'),token=window.StudioIcons.token(name);
  const start=area.selectionStart??area.value.length,end=area.selectionEnd??start;
  area.setRangeText(token,start,end,'end');
  area.dispatchEvent(new Event('input',{bubbles:true}));
  area.focus();
 }
 async function importZip(file){
  if(!file||video.recording||video.preparing)return;
  try{
   const entries=await window.StudioZip.read(file);
   const draftFile=entries.find(x=>x.path==='studio-draft.json');
   if(!draftFile)throw Error('Studio 검수 ZIP 안에 studio-draft.json이 없음');
   const draft=JSON.parse(await draftFile.blob.text());
   if(!draft.episode||!draft.contents||draft.episodeId!==state.id||draft.episode.id!==state.id)throw Error('현재 에피소드의 검수 ZIP이 아님');
   if(!Array.isArray(draft.episode.scenes)||draft.episode.scenes.length>120)throw Error('장면 수가 유효하지 않음');
   const restoredEpisode=clone(draft.episode),restoredContent=clone(draft.contents);
   normalizeScenes(restoredEpisode);
   if(Object.values(restoredContent).some(t=>typeof t!=='string'||t.length>100000))throw Error('장면 원고가 유효하지 않음');
   const prefix='episodes/'+state.id+'/assets/';
   const images=[];
   const extensionMime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',svg:'image/svg+xml'};
   for(const item of entries)if(item.path.startsWith(prefix)){
    const name=item.path.slice(prefix.length),ext=name.split('.').pop().toLowerCase();
    if(name.includes('/')||!name||!extensionMime[ext]||item.size>25*1024*1024)throw Error('지원하지 않는 이미지 파일: '+name);
    images.push({path:'assets/'+name,blob:new Blob([item.blob],{type:extensionMime[ext]})});
   }
   if(!confirm('검수 ZIP을 불러오면 이 에피소드의 현재 초안이 교체됩니다. 계속할까요?'))return;
   stopPlayer();
   await storeAssetBatch(state.id,images);
   state.episode=restoredEpisode;state.contents=restoredContent;
   $('episodeTitle').value=state.episode.title;
   state.activeId=state.episode.scenes[0]?.id||null;
   if(!immediateSave())throw Error('로컬 초안 저장 공간 부족');
   await loadAssets(state.id);await preloadScenes();
   player.index=0;player.elapsed=0;syncSafeSettings();renderTimeline();editScene(state.activeId);updateStage(activeScene());
   setStatus('검수 ZIP 가져오기 완료 · 에피소드별 로컬 저장',true);error('');
  }catch(err){error('검수 ZIP 가져오기 실패: '+err.message)}
 }
 function installEvents(){
  $('episodeSelect').addEventListener('change',e=>{if(state.unsaved)immediateSave();clearTimeout(state.saveTimer);switchEpisode(e.target.value)});
  $('newEpisodeBtn').addEventListener('click',newEpisode);
  $('resetBtn').addEventListener('click',resetDraft);
  $('addSceneBtn').addEventListener('click',addScene);
  $('episodeTitle').addEventListener('input',e=>{if(!state.episode)return;state.episode.title=e.target.value;const local=state.localIndex.find(x=>x.id===state.id);if(local){local.title=e.target.value;writeLocal(LOCAL_INDEX,state.localIndex)}scheduleSave();selectOptions()});
  $('sceneKind').addEventListener('change',e=>{changeField('kind',e.target.value);editScene(state.activeId)});
  $('duration').addEventListener('input',e=>changeField('durationMs',e.target.value));
  $('sceneVariant').addEventListener('change',e=>changeField('variant',e.target.value));
  $('transition').addEventListener('change',e=>changeField('transition',e.target.value));
  $('sceneRoom').addEventListener('input',e=>changeField('room',e.target.value));
  $('sceneContent').addEventListener('input',e=>{if(!activeScene())return;state.contents[state.activeId]=e.target.value;scheduleSave();updateStage(activeScene());preloadScenes().catch(err=>error(err.message))});
  $('sceneContent').addEventListener('paste',async e=>{
   const file=[...(e.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
   if(!file||video.recording)return;e.preventDefault();
   try{await uploadImage(file)}catch(err){error('붙여넣기 실패: '+err.message)}
  });
  $('saveBtn').addEventListener('click',immediateSave);
  $('playBtn').addEventListener('click',togglePlayback);
  $('seek').addEventListener('input',e=>seekTime(Number(e.target.value)/1000));
  $('recordBtn').addEventListener('click',recordClick);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&video.recording){error('화면이 숨겨져 녹화를 종료함 · 저장 파일 확인 필요');stopRecording(true)}});
  $('guideToggle').addEventListener('change',e=>$('guides').classList.toggle('hidden',!e.target.checked));
  for(const [id,k] of [['safeTop','top'],['safeRight','right'],['safeBottom','bottom']])$(id).addEventListener('change',e=>updateSafeSetting(k,e.target.value));
  $('exportBtn').addEventListener('click',exportReview);
  $('uploadImageBtn').addEventListener('click',()=>$('imageFile').click());
  $('imageFile').addEventListener('change',async e=>{const selected=[...(e.target.files||[])];e.target.value='';for(const f of selected){try{await uploadImage(f)}catch(err){error(f.name+': '+err.message)}}});
  for(const zone of [$('stage'),$('mediaGrid')]){
   zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drop-active')});
   zone.addEventListener('dragleave',()=>zone.classList.remove('drop-active'));
   zone.addEventListener('drop',async e=>{e.preventDefault();zone.classList.remove('drop-active');if(video.recording)return;for(const f of [...(e.dataTransfer?.files||[])]){try{await uploadImage(f)}catch(err){error(f.name+': '+err.message)}}});
  }
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';await importReview(f)});
  $('importZipBtn').addEventListener('click',()=>$('importZipFile').click());
  $('importZipFile').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';await importZip(f)});
  addEventListener('beforeunload',()=>{if(state.episode&&state.unsaved)immediateSave()});
 }
 async function init(){
  installEvents();
  await window.StudioIcons.ready;
  window.StudioIcons.decorate(document);
  window.StudioIcons.gallery($('iconGrid'),$('iconSearch'),insertIconToken);
  state.db=await loadDb();state.localIndex=localEpisodes();
  try{
   const manifest=await getJson(pathFor('episodes/manifest.json',document.baseURI));
   state.manifest=manifest.episodes||[];
   selectOptions();
   const requested=new URLSearchParams(location.search).get('episode');
   const id=allEpisodes().some(x=>x.id===requested)?requested:allEpisodes()[0]?.id;
   if(id)await switchEpisode(id);else error('에피소드가 없음 · 새 에피소드를 만들어 주세요');
  }catch(e){error(e.message);setStatus('에피소드 목록 오류')}
 }
 init();
})();
