/* Story Studio v0.1 — GitHub-published episodes + per-episode local drafts.
 * Deliberately separate from the legacy chat recorder to avoid breaking it.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),DRAFT='josa-studio:v1:draft:',LOCAL_INDEX='josa-studio:v1:local-episodes';
 const KINDS=['intro','chat','post','narration','photo','outro'];
 const KIND_NAME={intro:'인트로',chat:'단톡',post:'SNS 게시물',narration:'나레이션',photo:'사진',outro:'결말'};
 const KIND_ICON={intro:'▶',chat:'◉',post:'＠',narration:'▤',photo:'▣',outro:'■'};
 const DEFAULT_TEXT={
  intro:'# 새로운 이야기\n\n사건이 시작됩니다.',
  chat:'- 숙종: 잠깐만요\n- 신하: ?',
  post:'# 숙종\n@royal_official\n\n전하의 발표가 도착했습니다.',
  narration:'# 사건의 전말\n\n그때 조정에서는 중요한 변화가 일어났다.',
  photo:'# 인증 사진\n\n![사진](assets/photo.png)',
  outro:'# 결국\n\n역사는 이렇게 흘러갔다.'
 };
 const state={manifest:[],localIndex:[],id:null,base:null,episode:null,contents:{},baseContents:{},activeId:null,dirty:false,loading:false,assets:new Map(),db:null,saveTimer:null};
 const player={playing:false,index:0,elapsed:0,lastAt:0,raf:0};
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
  for(const row of await assetRows(id))state.assets.set(row.path,URL.createObjectURL(row.blob));
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
   state.dirty=!!draft;
   $('episodeTitle').value=state.episode.title;
   await loadAssets(id);
   selectOptions();renderTimeline();editScene(state.activeId);
   setStatus(draft?'로컬 초안 · '+new Date(draft.savedAt||Date.now()).toLocaleTimeString():'GitHub 배포본',!!draft);
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
  if(writeLocal(key(state.id),draft)){state.dirty=true;setStatus('초안 저장됨 · '+new Date().toLocaleTimeString(),true);return true}
  setStatus('저장 실패');return false;
 }
 function scheduleSave(){
  setStatus('수정됨 · 저장 중');
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>saveDraft(),250);
 }
 function immediateSave(){clearTimeout(state.saveTimer);return saveDraft()}
 function sceneLabel(scene){return (KIND_NAME[scene.kind]||scene.kind)+' · '+(scene.id||'')}
 function renderTimeline(){
  const host=$('timeline');host.replaceChildren();
  const list=state.episode?.scenes||[];
  list.forEach((scene,i)=>{
   const row=document.createElement('div');row.className='scene-item'+(state.activeId===scene.id?' selected':'');
   const mark=document.createElement('span');mark.className='scene-icon';mark.textContent=KIND_ICON[scene.kind]||'□';
   const button=document.createElement('button');button.type='button';button.className='scene-name';button.style.cssText='border:0;background:none;text-align:left;cursor:pointer';
   button.append(Object.assign(document.createElement('strong'),{textContent:scene.id}),Object.assign(document.createElement('small'),{textContent:KIND_NAME[scene.kind]+' · '+(scene.durationMs/1000).toFixed(1)+'초'}));
   button.addEventListener('click',()=>selectScene(scene.id));
   const up=document.createElement('button');up.className='mini';up.type='button';up.textContent='↑';up.title='앞으로';up.disabled=i===0;
   up.addEventListener('click',()=>moveScene(scene.id,-1));
   const down=document.createElement('button');down.className='mini';down.type='button';down.textContent='↓';down.title='뒤로';down.disabled=i===list.length-1;
   down.addEventListener('click',()=>moveScene(scene.id,1));
   row.append(mark,button,up,down);host.append(row);
  });
  $('scenePosition').textContent=list.length+'개 장면 · 총 '+fmt(totalDuration());
 }
 function stopPlayer(){
  player.playing=false;player.lastAt=0;
  if(player.raf)cancelAnimationFrame(player.raf);
  player.raf=0;$('playBtn').textContent='▶ 재생';
 }
 function setProgress(){
  if(!state.episode)return;
  const list=state.episode.scenes,total=Math.max(1,totalDuration());
  const prior=list.slice(0,player.index).reduce((sum,scene)=>sum+scene.durationMs,0);
  const elapsed=Math.min(total,prior+player.elapsed);
  $('progressFill').style.width=(100*elapsed/total).toFixed(2)+'%';
  $('previewTime').textContent=fmt(elapsed)+' / '+fmt(total);
 }
 function updateStage(scene){
  const host=$('sceneContainer');host.replaceChildren();host.className='scene';
  if(!scene){host.append(document.createTextNode('장면을 선택해 주세요'));setProgress();return}
  const context={episode:state.episode,resolveAsset,getSceneContent:id=>state.contents[id]||''};
  try{host.append(window.StudioRenderers.render(scene,state.contents[scene.id]||'',context))}
  catch(e){error('미리보기 오류: '+e.message)}
  if(scene.transition==='fade')host.classList.add('is-fading');
  setProgress();
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
   $('sceneKind').value=scene.kind;$('duration').value=scene.durationMs;
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
   const v=Math.round(Number(value));if(!Number.isFinite(v))return;
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
    stopPlayer();player.index=state.episode.scenes.length-1;player.elapsed=state.episode.scenes.at(-1)?.durationMs||0;setProgress();return;
   }
   state.activeId=current.id;renderTimeline();editScene(current.id);updateStage(current);
  }
  setProgress();player.raf=requestAnimationFrame(frame);
 }
 function togglePlayback(){
  const scenes=state.episode?.scenes||[];
  if(!scenes.length)return;
  if(player.playing){stopPlayer();return}
  player.playing=true;player.lastAt=0;
  if(player.index>=scenes.length)player.index=0;
  if(player.elapsed>=scenes[player.index].durationMs){player.index=0;player.elapsed=0}
  $('playBtn').textContent='Ⅱ 정지';player.raf=requestAnimationFrame(frame);
 }
 function download(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
 }
 function safeName(name){return String(name).replace(/[^a-zA-Z0-9._가-힣-]/g,'_').replace(/^\.+/,'').slice(0,100)||'image.png'}
 async function uploadImage(file){
  if(!file||!file.type.startsWith('image/'))throw Error('이미지 파일만 업로드 가능');
  if(file.size>25*1024*1024)throw Error('이미지는 25MB 이하만 지원');
  const scene=activeScene();if(!scene)throw Error('장면을 먼저 추가해 주세요');
  let path='assets/'+safeName(file.name);
  await putAsset(state.id,path,file);
  const old=state.assets.get(path);if(old)URL.revokeObjectURL(old);
  state.assets.set(path,URL.createObjectURL(file));
  state.contents[scene.id]=(state.contents[scene.id]||'').trimEnd()+'\n\n![사진]('+path+')';
  $('sceneContent').value=state.contents[scene.id];
  scheduleSave();updateStage(scene);
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
   state.activeId=state.episode.scenes[0]?.id||null;renderTimeline();editScene(state.activeId);selectScene(state.activeId);
  }catch(e){error('가져오기 실패: '+e.message)}
 }
 function installEvents(){
  $('episodeSelect').addEventListener('change',e=>{clearTimeout(state.saveTimer);switchEpisode(e.target.value)});
  $('newEpisodeBtn').addEventListener('click',newEpisode);
  $('resetBtn').addEventListener('click',resetDraft);
  $('addSceneBtn').addEventListener('click',addScene);
  $('episodeTitle').addEventListener('input',e=>{if(!state.episode)return;state.episode.title=e.target.value;const local=state.localIndex.find(x=>x.id===state.id);if(local){local.title=e.target.value;writeLocal(LOCAL_INDEX,state.localIndex)}scheduleSave();selectOptions()});
  $('sceneKind').addEventListener('change',e=>{changeField('kind',e.target.value);editScene(state.activeId)});
  $('duration').addEventListener('input',e=>changeField('durationMs',e.target.value));
  $('sceneVariant').addEventListener('change',e=>changeField('variant',e.target.value));
  $('transition').addEventListener('change',e=>changeField('transition',e.target.value));
  $('sceneRoom').addEventListener('input',e=>changeField('room',e.target.value));
  $('sceneContent').addEventListener('input',e=>{if(!activeScene())return;state.contents[state.activeId]=e.target.value;scheduleSave();updateStage(activeScene())});
  $('saveBtn').addEventListener('click',immediateSave);
  $('playBtn').addEventListener('click',togglePlayback);
  $('guideToggle').addEventListener('change',e=>$('guides').classList.toggle('hidden',!e.target.checked));
  $('exportBtn').addEventListener('click',exportReview);
  $('uploadImageBtn').addEventListener('click',()=>$('imageFile').click());
  $('imageFile').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await uploadImage(f)}catch(err){error(err.message)}});
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';await importReview(f)});
  addEventListener('beforeunload',()=>{if(state.episode&&state.dirty)immediateSave()});
 }
 async function init(){
  installEvents();state.db=await loadDb();state.localIndex=localEpisodes();
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
