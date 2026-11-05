/* Small store-only ZIP writer for reviewed episode bundles (no third-party CDN). */
(function(global){
 'use strict';
 const encoder=new TextEncoder();
 const table=new Uint32Array(256);
 for(let i=0;i<256;i++){let value=i;for(let k=0;k<8;k++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;table[i]=value>>>0}
 function checksum(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
 function isSafePath(path){return /^[^\\\u0000-\u001f]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').includes('..')&&!path.includes('//')}
 async function build(files){
  if(!Array.isArray(files)||!files.length)throw Error('ZIP 항목이 없음');
  const chunks=[],records=[];let offset=0;
  for(const {path,data} of files){
   if(!isSafePath(path))throw Error('위험한 ZIP 경로: '+path);
   const name=encoder.encode(path),bytes=data instanceof Uint8Array?data:new Uint8Array(data instanceof Blob?await data.arrayBuffer():encoder.encode(String(data)));
   const size=bytes.length;
   if(name.length>65535||size>0xffffffff||offset>0xffffffff)throw Error('ZIP 형식 제한 초과');
   const crc=checksum(bytes),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
   v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);
   v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);
   h.set(name,30);chunks.push(h,bytes);records.push({name,size,crc,offset});offset+=h.length+size;
  }
  const central=[];
  for(const r of records){
   const h=new Uint8Array(46+r.name.length),v=new DataView(h.buffer);
   v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);
   v.setUint32(16,r.crc,true);v.setUint32(20,r.size,true);v.setUint32(24,r.size,true);
   v.setUint16(28,r.name.length,true);v.setUint32(42,r.offset,true);h.set(r.name,46);central.push(h);
  }
  const directorySize=central.reduce((sum,b)=>sum+b.length,0),end=new Uint8Array(22),tail=new DataView(end.buffer);
  tail.setUint32(0,0x06054b50,true);tail.setUint16(8,records.length,true);tail.setUint16(10,records.length,true);
  tail.setUint32(12,directorySize,true);tail.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
 }
 global.StudioZip=Object.freeze({build});
})(window);
