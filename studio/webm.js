/* Same validated WebM duration metadata repair used by legacy recorder. */
(function(global){
'use strict';
function readEbmlPrefix(bytes,offset){
 if(offset<0||offset>=bytes.length||!bytes[offset])throw Error('EBML header is missing');
 let width=1,flag=0x80;
 while(!(bytes[offset]&flag)){width++;flag>>=1;if(width>8)throw Error('EBML VINT too long')}
 if(offset+width>bytes.length)throw Error('EBML header is truncated');
 return {width,flag};
}
function readEbmlElement(bytes,offset){
 const idHead=readEbmlPrefix(bytes,offset);
 if(idHead.width>4)throw Error('Invalid EBML element ID');
 let id=0;for(let i=0;i<idHead.width;i++)id=id*256+bytes[offset+i];
 const pos=offset+idHead.width,szHead=readEbmlPrefix(bytes,pos);
 let size=BigInt(bytes[pos]&(szHead.flag-1));
 for(let i=1;i<szHead.width;i++)size=(size<<8n)+BigInt(bytes[pos+i]);
 const unknown=size===(1n<<BigInt(szHead.width*7))-1n;
 if(!unknown&&size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('WebM element too large');
 const dataStart=pos+szHead.width,n=unknown?null:Number(size);
 return {id,size:n,sizeStart:pos,sizeWidth:szHead.width,dataStart,end:n===null?null:dataStart+n};
}
function encodeEbmlSize(size,width){
 if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid WebM element size');
 let n=width;
 while(n<=8&&BigInt(size)>=(1n<<BigInt(7*n))-1n)n++;
 if(n>8)throw Error('WebM element size overflow');
 const arr=new Uint8Array(n);let x=BigInt(size);
 for(let i=n-1;i>=0;i--){arr[i]=Number(x&255n);x>>=8n}
 arr[0]|=1<<(8-n);return arr;
}
async function fixRecordedWebmDuration(blob,durationMs){
 if(!Number.isFinite(durationMs)||durationMs<=0)return {blob,ok:false,note:'녹화 길이를 측정하지 못함'};
 try{
  // The MediaRecorder Info element sits near the beginning of the file.
  const bytes=new Uint8Array(await blob.slice(0,Math.min(blob.size,1024*1024)).arrayBuffer());
  let segment=null;
  for(let p=0;p<bytes.length;){
   const el=readEbmlElement(bytes,p);
   if(el.id===0x18538067){segment=el;break}
   if(el.end===null||el.end<=p||el.end>bytes.length)break;
   p=el.end;
  }
  if(!segment)return {blob,ok:false,note:'WebM Segment 없음'};
  let info=null,seekHead=false;
  for(let p=segment.dataStart;p<bytes.length&&p<(segment.end??blob.size);){
   const el=readEbmlElement(bytes,p);
   if(el.id===0x114d9b74)seekHead=true;
   if(el.id===0x1549a966){info=el;break}
   if(el.end===null||el.end<=p||el.end>bytes.length)break;
   p=el.end;
  }
  if(!info||info.end===null||info.end>bytes.length)return {blob,ok:false,note:'WebM Info 없음'};
  let scale=1000000,durationElement=null;
  for(let p=info.dataStart;p<info.end;){
   const el=readEbmlElement(bytes,p);
   if(el.end===null||el.end>info.end||el.end<=p)throw Error('Invalid WebM Info size');
   if(el.id===0x2ad7b1){
    scale=0;for(let j=el.dataStart;j<el.end;j++)scale=scale*256+bytes[j];
   }
   if(el.id===0x4489){
    durationElement=el;const n=el.end-el.dataStart;
    if(n===4||n===8){
     const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
     const old=n===4?dv.getFloat32(el.dataStart,false):dv.getFloat64(el.dataStart,false);
     if(Number.isFinite(old)&&old>0)return {blob,ok:true,note:'기존 길이 정보 유지'};
    }
   }
   p=el.end;
  }
  if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid WebM TimestampScale');
  const ticks=durationMs*1000000/scale;
  if(!Number.isFinite(ticks)||ticks<=0)throw Error('Invalid WebM Duration');
  if(durationElement){
   const width=durationElement.end-durationElement.dataStart;
   if(width!==4&&width!==8)return {blob,ok:false,note:'지원되지 않는 Duration 필드'};
   const arr=new Uint8Array(width),dv=new DataView(arr.buffer);
   if(width===4)dv.setFloat32(0,ticks,false);else dv.setFloat64(0,ticks,false);
   return {blob:new Blob([blob.slice(0,durationElement.dataStart),arr,blob.slice(durationElement.end)],{type:blob.type}),ok:true,note:'길이 정보 수정'};
  }
  // SeekHead stores byte offsets, which could change when Info grows.
  if(seekHead)return {blob,ok:false,note:'SeekHead가 있어 안전한 수정 불가'};
  const duration=new Uint8Array(11);
  duration[0]=0x44;duration[1]=0x89;duration[2]=0x88;
  new DataView(duration.buffer).setFloat64(3,ticks,false);
  const newInfoSize=encodeEbmlSize(info.size+duration.length,info.sizeWidth);
  const growth=duration.length+newInfoSize.length-info.sizeWidth;
  let pieces;
  if(segment.size===null)pieces=[blob.slice(0,info.sizeStart)];
  else{
   const newSegmentSize=encodeEbmlSize(segment.size+growth,segment.sizeWidth);
   if(newSegmentSize.length!==segment.sizeWidth)return {blob,ok:false,note:'Segment 크기 필드에 여유 없음'};
   pieces=[blob.slice(0,segment.sizeStart),newSegmentSize,blob.slice(segment.sizeStart+segment.sizeWidth,info.sizeStart)];
  }
  pieces.push(newInfoSize,blob.slice(info.dataStart,info.end),duration,blob.slice(info.end));
  return {blob:new Blob(pieces,{type:blob.type}),ok:true,note:'길이 정보 추가'};
 }catch(err){return {blob,ok:false,note:err?.message||'메타데이터 보정 실패'}}
}

global.StudioWebM=Object.freeze({fixDuration:fixRecordedWebmDuration});
})(window);
