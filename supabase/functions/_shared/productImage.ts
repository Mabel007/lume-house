// Deliberately narrow format: non-interlaced, 8-bit RGB/RGBA PNG only.
// Validate chunk CRCs and the bounded decompressed pixel stream, not filenames.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function validateProductPng(bytes: Uint8Array, mime: string) {
  if (mime !== 'image/png' || bytes.length < 45 || bytes.length > MAX_IMAGE_BYTES) throw new Error('INVALID_IMAGE');
  if (![137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) throw new Error('INVALID_IMAGE');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const clean: Uint8Array<ArrayBuffer>[] = [bytes.slice(0,8)], compressed: Uint8Array[] = [];
  let width=0, height=0, channels=0, offset=8, ended=false, idatEnded=false, compressedSize=0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('INVALID_IMAGE');
    const length=view.getUint32(offset), end=offset+12+length;
    if (end > bytes.length) throw new Error('INVALID_IMAGE');
    const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset+4,end-4)) !== view.getUint32(end-4)) throw new Error('INVALID_IMAGE');
    const data=bytes.subarray(offset+8,end-4);
    if (offset===8 && type!=='IHDR') throw new Error('INVALID_IMAGE');
    if (type==='IHDR') {
      if (offset!==8 || length!==13) throw new Error('INVALID_IMAGE');
      width=view.getUint32(offset+8); height=view.getUint32(offset+12);
      channels=data[9]===2 ? 3 : data[9]===6 ? 4 : 0;
      if (!width || !height || width>4096 || height>4096 || width*height>4_000_000 || data[8]!==8 || !channels || data[10]!==0 || data[11]!==0 || data[12]!==0) throw new Error('UNSUPPORTED_IMAGE');
      clean.push(bytes.slice(offset,end));
    } else if (type==='IDAT') {
      if (idatEnded) throw new Error('INVALID_IMAGE');
      compressed.push(data); compressedSize+=length; clean.push(bytes.slice(offset,end));
    } else if (type==='IEND') {
      if (length!==0 || !compressedSize || end!==bytes.length) throw new Error('INVALID_IMAGE');
      clean.push(bytes.slice(offset,end)); ended=true;
    } else {
      // Strip optional metadata; reject animation, transparency modifiers and unknown critical chunks.
      if (['acTL','fcTL','fdAT','tRNS'].includes(type) || type[0]===type[0].toUpperCase()) throw new Error('UNSUPPORTED_IMAGE');
      if (compressedSize) idatEnded=true;
    }
    offset=end;
  }
  if (!ended) throw new Error('INVALID_IMAGE');
  const packed=new Uint8Array(compressedSize); let position=0;
  for (const part of compressed) {packed.set(part,position);position+=part.length;}
  const stride=width*channels+1, expected=stride*height;
  const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let decoded=0;
  try {
    while (true) {
      const {done,value}=await reader.read(); if (done) break;
      if (decoded+value.length>expected) throw new Error('INVALID_IMAGE');
      for (let index=(stride-decoded%stride)%stride;index<value.length;index+=stride) if (value[index]>4) throw new Error('INVALID_IMAGE');
      decoded+=value.length;
    }
    if (decoded!==expected) throw new Error('INVALID_IMAGE');
  } finally {await reader.cancel().catch(()=>{});}
  return {width,height,bytes:new Uint8Array(await new Blob(clean).arrayBuffer())};
}

export async function boundedImageBody(request: Request): Promise<Uint8Array> {
  if (!request.body || Number(request.headers.get('content-length'))>MAX_IMAGE_BYTES) throw new Error('INVALID_IMAGE');
  const reader=request.body.getReader(), parts: Uint8Array[]=[]; let size=0;
  try {while (true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE_BYTES)throw new Error('INVALID_IMAGE');parts.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
