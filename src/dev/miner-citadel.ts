import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { animateSurface, staticLampBounce } from '../adapters/outbound/worlds/miner-citadel/surface-flow';
import { GpuTimer, percentile } from '../adapters/outbound/worlds/miner-citadel/performance';

interface Contract {
  asset: string;
  stage?: string;
  wideLighting?: boolean;
  camera: { position: number[]; target: number[]; fov: number; aspect: number; near: number; far: number };
  fog: { color: string; near: number; far: number };
  dynamicPoints: {position:number[];color:number[];intensity:number;range:number}[];
}
const host=document.querySelector<HTMLDivElement>('#scene')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const composition=new URLSearchParams(location.search).get('composition') ?? 'C';
const diagnosticMode=new URLSearchParams(location.search).has('diagnostic');
if(diagnosticMode&&composition!=='C')throw new Error('Semantic diagnostics currently support authored composition C only');
const contractUrl=composition==='C'?'/models/environments/miner-citadel-districts/scene.json':composition==='polish'?'/models/environments/miner-citadel/scene.json':`/models/environments/miner-citadel-wide/${composition==='A'?'a':'b'}/scene.json`;
const response=await fetch(contractUrl);
if(!response.ok)throw new Error(`Scene contract: ${response.status}`);
const spec=await response.json() as Contract;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#101d2c');scene.fog=new THREE.Fog(spec.fog.color,spec.fog.near,spec.fog.far);
const camera=new THREE.PerspectiveCamera(spec.camera.fov,spec.camera.aspect,spec.camera.near,spec.camera.far);
camera.position.fromArray(spec.camera.position);camera.lookAt(new THREE.Vector3().fromArray(spec.camera.target));
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.35;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#8aa6ca','#61432c',1.1));
const key=new THREE.DirectionalLight('#a8caff',2.5);key.position.copy(spec.wideLighting?new THREE.Vector3(-35,70,35):new THREE.Vector3(-16,36,12));key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-48,right:48,top:36,bottom:-30,near:1,far:160});key.shadow.bias=-.0003;if(spec.wideLighting){Object.assign(key.shadow.camera,{left:-100,right:100,top:85,bottom:-65,near:1,far:360});key.shadow.camera.updateProjectionMatrix();}scene.add(key);
const warm=new THREE.DirectionalLight('#ffad66',1.6);warm.position.set(-34,5,36);scene.add(warm);
const fill=new THREE.DirectionalLight('#99bbff',.7);fill.position.set(22,20,-65);scene.add(fill);
for(const p of spec.dynamicPoints){const light=new THREE.PointLight(new THREE.Color().fromArray(p.color),p.intensity,p.range,2);light.position.fromArray(p.position);scene.add(light);}
const gltf=await new GLTFLoader().loadAsync('/'+spec.asset);scene.add(gltf.scene);
const time={value:0};const materials=new Set<THREE.MeshStandardMaterial>();const textures=new Set<THREE.Texture>();
gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.castShadow=true;object.receiveShadow=true;
 for(const m of Array.isArray(object.material)?object.material:[object.material]){if(!(m instanceof THREE.MeshStandardMaterial)||materials.has(m))continue;materials.add(m);
  if(object.geometry.getAttribute('color'))staticLampBounce(m);
  if(m.name.startsWith('PBR/water')||m.name.startsWith('PBR/lava')){m.side=THREE.DoubleSide;animateSurface(m,m.name.startsWith('PBR/water')?'water':'lava',time);}
  for(const v of Object.values(m)){if(v instanceof THREE.Texture){textures.add(v);v.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}}
 }
});
const controls=!diagnosticMode&&new URLSearchParams(location.search).has('orbit')?new OrbitControls(camera,renderer.domElement):null;
controls?.target.fromArray(spec.camera.target);controls?.update();
function resize(){const w=Math.min(innerWidth,innerHeight*1.6),h=w/1.6;renderer.setSize(w,h);host.style.cssText=`position:absolute;width:${w}px;height:${h}px;left:50%;top:50%;transform:translate(-50%,-50%)`;}
resize();window.addEventListener('resize',resize);
const timer=new GpuTimer(renderer.getContext() as WebGL2RenderingContext);const frames:number[]=[];const submissions:number[]=[];
let raf=0,last=performance.now(),elapsed=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now:number){raf=requestAnimationFrame(frame);if(document.hidden){last=now;return;}const delta=Math.min((now-last)/1000,.1);frames.push(now-last);if(frames.length>600)frames.shift();last=now;elapsed+=delta;time.value=diagnosticMode||reduced?0:elapsed;
 timer.poll();timer.begin();const start=performance.now();renderer.render(scene,camera);submissions.push(performance.now()-start);if(submissions.length>600)submissions.shift();timer.end();
}
raf=requestAnimationFrame(frame);
function metrics(){return {stage:spec.stage ?? 'polish',camera:spec.camera,bloom:false,bloomReason:'Disabled: no validated GPU A/B measurement',gpuTimerSupported:timer.supported,samples:timer.samples.length,gpuP95Ms:percentile(timer.samples,.95),frameP95Ms:percentile(frames.slice(60),.95),cpuSubmissionP95Ms:percentile(submissions.slice(60),.95),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:renderer.info.memory};}
function snapshot(){const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(1536,960,false);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);const link=document.createElement('a');link.download=`citadel-${spec.stage ?? 'polish'}-three-review.png`;link.href=png;link.click();return png;}
Object.assign(window,{citadelReview:{metrics,snapshot,resetMetrics(){frames.length=0;submissions.length=0;timer.clear();}}});
status.textContent=`Шахта · ${spec.stage ?? 'polish'} · S: PNG · M: метрики · ?composition=A / B / C / polish`; 
if(diagnosticMode){
 status.hidden=true;
 const {installDiagnostic}=await import('./visual-review/capture');
 const diagnostic=await installDiagnostic(renderer,scene,gltf.scene,camera,o=>gltf.parser.associations.get(o),'/'+spec.asset);
 Object.assign(window,{citadelDiagnostic:{ready:true,capture:diagnostic.capture}});
 window.addEventListener('pagehide',()=>diagnostic.dispose(),{once:true});
}
window.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='s')snapshot();if(event.key.toLowerCase()==='m')status.textContent=JSON.stringify(metrics());});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);controls?.dispose();timer.dispose();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment.dispose();key.shadow.dispose();renderer.dispose();},{once:true});
