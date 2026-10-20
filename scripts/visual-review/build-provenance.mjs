import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path='public/models/environments/miner-citadel-districts/citadel.glb',b=readFileSync(path),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12))),base=28+b.readUInt32LE(12);
const source=JSON.parse(readFileSync('artifacts/visual-review/source-provenance.json'));
function values(i){const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],read={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE'}[a.componentType],offset=base+(v.byteOffset??0)+(a.byteOffset??0);return Array.from({length:a.count*n},(_,k)=>b[read](offset+Math.floor(k/n)*(v.byteStride??size*n)+(k%n)*size));}
let total=0,matched=0,unknown=0;
const primitives=j.meshes.flatMap((m,mi)=>m.primitives.map((p,pi)=>{const positions=values(p.attributes.POSITION),indices=values(p.indices),labels=[];for(let i=0;i<indices.length;i+=3){const key=[0,1,2].map(axis=>Math.floor((positions[indices[i]*3+axis]+positions[indices[i+1]*3+axis]+positions[indices[i+2]*3+axis])/3*1000+.5)).join(',');const id=source.triangles[key]??0;total++;if(key in source.triangles)matched++;if(id===0)unknown++;labels.push(id);}return {mesh:mi,primitive:pi,positionCount:j.accessors[p.attributes.POSITION].count,indexCount:indices.length,labels};}));
const out={version:1,assetSha256:createHash('sha256').update(b).digest('hex'),asset:path,method:source.method,totalTriangles:total,matchedTriangles:matched,unknownTriangles:unknown,coverage:matched/total,primitives};
writeFileSync('public/diagnostics/miner-categories.json',JSON.stringify(out));
console.log(JSON.stringify({total,matched,unknown,coverage:out.coverage}));
if(out.coverage<.99)throw Error('Provenance coverage below 99%; diagnostic must not silently guess semantics');
