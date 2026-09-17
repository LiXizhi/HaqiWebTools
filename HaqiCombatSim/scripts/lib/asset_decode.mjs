// Structural PNG decoding without a native image dependency: CRC, chunks and zlib stream.
import { inflateSync } from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(buffer){let value=0xffffffff;for(const byte of buffer){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
export function validateMedia(filename,data){
    if(filename.endsWith('.ogg')){if(data.toString('ascii',0,4)!=='OggS')throw new Error('Invalid Ogg');return;}
    if(filename.endsWith('.webp')){
        if(data.length<20||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP'||data.readUInt32LE(4)+8!==data.length)throw new Error('Invalid WebP container');
        let offset=12,dimensions=null,pixels=false;
        while(offset+8<=data.length){
            const type=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4),start=offset+8,end=start+size;
            if(end>data.length)throw new Error('Truncated WebP chunk');
            if(type==='VP8X'&&size>=10)dimensions={width:1+data.readUIntLE(start+4,3),height:1+data.readUIntLE(start+7,3)};
            if(type==='VP8L'&&size>=5){if(data[start]!==0x2f)throw new Error('Invalid lossless WebP');const bits=data.readUInt32LE(start+1);dimensions={width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};pixels=true;}
            if(type==='VP8 '&&size>=10){if(data.toString('hex',start+3,start+6)!=='9d012a')throw new Error('Invalid WebP frame');dimensions||={width:data.readUInt16LE(start+6)&0x3fff,height:data.readUInt16LE(start+8)&0x3fff};pixels=true;}
            offset=end+(size%2);
        }
        if(offset!==data.length||!pixels||!dimensions?.width||!dimensions?.height)throw new Error('Incomplete WebP');
        return dimensions; // Full pixel decoding: preparation command and browser. Integrity: SHA-256 manifest.
    }
    if(!filename.endsWith('.png'))throw new Error(`Unknown image format: ${filename}`);
    if(!data.subarray(0,8).equals(signature))throw new Error('Invalid PNG signature');
    let offset=8,header=null,ended=false;const chunks=[];
    while(offset+12<=data.length){
        const size=data.readUInt32BE(offset),end=offset+12+size;
        if(end>data.length)throw new Error('Truncated PNG');
        const type=data.toString('ascii',offset+4,offset+8),payload=data.subarray(offset+8,end-4);
        if(crc32(data.subarray(offset+4,end-4))!==data.readUInt32BE(end-4))throw new Error('PNG CRC mismatch');
        if(type==='IHDR')header=payload;
        if(type==='IDAT')chunks.push(payload);
        if(type==='IEND'){ended=true;break;}
        offset=end;
    }
    if(!header||header.length!==13||!ended||!chunks.length)throw new Error('Incomplete PNG');
    const width=header.readUInt32BE(0),height=header.readUInt32BE(4),depth=header[8],type=header[9],interlace=header[12];
    if(!width||!height||width>8192||height>8192)throw new Error('Invalid PNG dimensions');
    const pixels=inflateSync(Buffer.concat(chunks),{maxOutputLength:300000000});
    if(!interlace){const channels={0:1,2:3,3:1,4:2,6:4}[type],stride=Math.ceil(width*channels*depth/8)+1;
        if(!channels||pixels.length!==stride*height)throw new Error('Invalid decoded PNG data');
        for(let y=0;y<height;y++)if(pixels[y*stride]>4)throw new Error('Invalid PNG filter');
    }
    return{width,height};
}
