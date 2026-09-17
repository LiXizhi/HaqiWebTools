// Structural PNG decoding without a native image dependency: CRC, chunks and zlib stream.
import { inflateSync } from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(buffer){let value=0xffffffff;for(const byte of buffer){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
export function validateMedia(filename,data){
    if(filename.endsWith('.ogg')){if(data.toString('ascii',0,4)!=='OggS')throw new Error('Invalid Ogg');return;}
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
