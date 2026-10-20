import * as THREE from 'three';
interface Provenance {assetSha256:string;coverage:number;primitives:{mesh:number;primitive:number;positionCount:number;indexCount:number;labels:number[]}[]}
interface Layout {resolution:[number,number];depthBins:number[];categories:{id:number;name:string;color:[number,number,number]}[]}
const vertex=`attribute float diagnosticCategory; varying float category; varying float distanceZ;
void main(){category=diagnosticCategory;vec4 v=modelViewMatrix*vec4(position,1.0);distanceZ=-v.z;gl_Position=projectionMatrix*v;}`;
const fragment=`uniform float mode; uniform float cameraNear; uniform float cameraFar; varying float category; varying float distanceZ;
void main(){if(mode<0.5){gl_FragColor=vec4(category/255.0,0.0,0.0,1.0);}else{float n=floor(clamp((distanceZ-cameraNear)/(cameraFar-cameraNear),0.0,1.0)*16777214.0);float r=floor(n/65536.0);float g=floor(mod(n,65536.0)/256.0);float b=mod(n,256.0);gl_FragColor=vec4(r,g,b,255.0)/255.0;}}`;
function png(data:Uint8Array,w:number,h:number){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d')!;c.putImageData(new ImageData(new Uint8ClampedArray(data),w,h),0,0);return canvas.toDataURL('image/png');}
function flip(data:Uint8Array,w:number,h:number){const out=new Uint8Array(data.length);for(let y=0;y<h;y++)out.set(data.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);return out;}
/** Same scene tree and WebGLRenderer; temporary per-triangle attributes are always restored. */
export async function installDiagnostic(renderer:THREE.WebGLRenderer,scene:THREE.Scene,root:THREE.Object3D,camera:THREE.PerspectiveCamera,association:(o:THREE.Object3D)=>{meshes?:number;primitives?:number}|undefined,assetUrl:string){
 const [provenance,layout,asset]=await Promise.all([fetch('/diagnostics/miner-categories.json').then(r=>{if(!r.ok)throw Error('Missing semantic provenance');return r.json() as Promise<Provenance>;}),fetch('/diagnostics/reference-layout.json').then(r=>r.json() as Promise<Layout>),fetch(assetUrl).then(r=>r.arrayBuffer())]);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',asset)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==provenance.assetSha256||provenance.coverage<.99)throw Error('Stale or incomplete semantic provenance: regenerate before capture');
 const entries:{object:THREE.Mesh;geometry:THREE.BufferGeometry;diagnostic:THREE.BufferGeometry;material:THREE.Material|THREE.Material[]}[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const a=association(o),p=provenance.primitives.find(p=>p.mesh===a?.meshes&&p.primitive===a?.primitives);if(!p||o.geometry.index?.count!==p.indexCount||o.geometry.getAttribute('position').count!==p.positionCount)throw Error(`Missing primitive provenance: ${o.name}`);
  const g=o.geometry.toNonIndexed();const ids=new Float32Array(p.labels.length*3);p.labels.forEach((id,i)=>ids.fill(id,i*3,i*3+3));g.setAttribute('diagnosticCategory',new THREE.BufferAttribute(ids,1));entries.push({object:o,geometry:o.geometry,diagnostic:g,material:o.material});
 });
 const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{mode:{value:0},cameraNear:{value:camera.near},cameraFar:{value:camera.far}},side:THREE.DoubleSide,depthTest:true,depthWrite:true,toneMapped:false});
 function capture(){
  const [w,h]=layout.resolution,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),target=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
  const state={background:scene.background,fog:scene.fog,override:scene.overrideMaterial,clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,shadowEnabled:renderer.shadowMap.enabled,shadowAuto:renderer.shadowMap.autoUpdate,xr:renderer.xr.enabled};
  const rt=new THREE.WebGLRenderTarget(w,h,{depthBuffer:true,stencilBuffer:false,type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});rt.texture.colorSpace=THREE.NoColorSpace;
  try{
   renderer.xr.enabled=false;renderer.setRenderTarget(null);renderer.setPixelRatio(1);renderer.setSize(w,h,false);renderer.setViewport(0,0,w,h);renderer.setScissorTest(false);renderer.autoClear=true;
   renderer.render(scene,camera);const beauty=renderer.domElement.toDataURL('image/png');
   for(const e of entries){e.object.geometry=e.diagnostic;e.object.material=material;}
   scene.overrideMaterial=null;scene.background=null;scene.fog=null;renderer.shadowMap.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(rt);renderer.setClearColor(new THREE.Color(1,0,0),1);
   material.uniforms.mode!.value=0;renderer.render(scene,camera);const raw=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,raw);const mask=flip(raw,w,h);
   material.uniforms.mode!.value=1;renderer.setClearColor(new THREE.Color(1,1,1),1);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,w,h,raw);const depth=flip(raw,w,h);
   const pretty=new Uint8Array(raw.length),visual=new Uint8Array(raw.length);
   const regions=layout.categories.map(c=>({...c,pixels:0,minX:w,minY:h,maxX:-1,maxY:-1,sumX:0,sumY:0,depthSum:0,depthBins:Array(layout.depthBins.length-1).fill(0) as number[]}));
   for(let i=0;i<w*h;i++){const id=mask[i*4],x=i%w,y=Math.floor(i/w),r=regions.find(r=>r.id===id)!;if(!r)throw Error(`Unexpected category ${id}`);const packed=depth[i*4]!*65536+depth[i*4+1]!*256+depth[i*4+2]!,z=camera.near+packed/16777214*(camera.far-camera.near);
    r.pixels++;r.sumX+=x+.5;r.sumY+=y+.5;r.minX=Math.min(r.minX,x);r.minY=Math.min(r.minY,y);r.maxX=Math.max(r.maxX,x);r.maxY=Math.max(r.maxY,y);r.depthSum+=z;
    const bin=layout.depthBins.findIndex((edge,k)=>k<layout.depthBins.length-1&&z>=edge&&z<layout.depthBins[k+1]!);if(bin>=0&&id!==255)r.depthBins[bin]=(r.depthBins[bin]??0)+1;
    pretty.set([...r.color,255],i*4);const v=id===255?0:Math.round(255*(1-Math.log1p(z)/Math.log1p(camera.far)));visual.set([v,v,v,255],i*4);
   }
   const metadata={version:1,source:'Three.js WebGL readback, same renderer and object tree',resolution:[w,h],assetSha256:hash,provenanceCoverage:provenance.coverage,camera:{matrixWorld:camera.matrixWorld.toArray(),projectionMatrix:camera.projectionMatrix.toArray(),near:camera.near,far:camera.far,fov:camera.fov,aspect:camera.aspect},renderer:{toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace,beautyAntialias:true,maskAntialias:false,shadowMapEnabled:state.shadowEnabled},depthEncoding:'24-bit RGB, linear view-space -Z: near + packed/16777214*(far-near); background=16777215',depthBins:layout.depthBins,semanticPolicy:'Nearest double-sided opaque surface; water treated opaque in diagnostic only. Geometry categories follow authored source collections. Not photometric visibility.',regions:regions.map(r=>({id:r.id,name:r.name,pixels:r.pixels,fraction:r.pixels/(w*h),bounds:r.pixels?[r.minX/w,r.minY/h,(r.maxX+1)/w,(r.maxY+1)/h]:null,centroid:r.pixels?[r.sumX/r.pixels/w,r.sumY/r.pixels/h]:null,meanViewDepth:r.pixels&&r.id!==255?r.depthSum/r.pixels:null,depthBins:r.depthBins}))};
   return {beauty,semantic:png(pretty,w,h),semanticRaw:png(mask,w,h),depth:png(visual,w,h),depthRaw:png(depth,w,h),metadata};
  }finally{
   for(const e of entries){e.object.geometry=e.geometry;e.object.material=e.material;}
   scene.background=state.background;scene.fog=state.fog;scene.overrideMaterial=state.override;renderer.shadowMap.enabled=state.shadowEnabled;renderer.shadowMap.autoUpdate=state.shadowAuto;renderer.xr.enabled=state.xr;renderer.autoClear=state.autoClear;renderer.setClearColor(state.clear,state.alpha);renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);rt.dispose();renderer.render(scene,camera);
  }
 }
 return {capture,dispose(){entries.forEach(e=>e.diagnostic.dispose());material.dispose();}};
}
