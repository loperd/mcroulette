import { ACESFilmicToneMapping, Box3, Color, DirectionalLight, HemisphereLight, Mesh, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject } from '../adapters/outbound/chest/dispose-object.ts';

// Review one pre-authored GLB. No architecture is generated in the browser.
const host = document.querySelector<HTMLElement>('#scene')!;
const status = document.querySelector<HTMLElement>('#status')!;
const scene = new Scene(); scene.background = new Color('#111a28');
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
host.append(renderer.domElement);
const camera = new PerspectiveCamera(43, 1.6, .1, 200); camera.position.set(24, 20, 43);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 10, 0); controls.enableDamping = true; controls.minDistance = 20; controls.maxDistance = 80; controls.maxPolarAngle = Math.PI * .49;
scene.add(new HemisphereLight('#b7cff4', '#55402e', 1));
function key(color: string, intensity: number, position: [number,number,number], shadow = false) {
  const light = new DirectionalLight(color,intensity); light.position.set(...position); light.target.position.set(0,9,0); light.castShadow = shadow;
  if (shadow) { light.shadow.mapSize.set(2048,2048); Object.assign(light.shadow.camera,{left:-24,right:24,top:27,bottom:-12,near:1,far:100}); light.shadow.normalBias=.025; light.shadow.bias=-.0001; }
  scene.add(light,light.target);
}
key('#c8dcff',3.1,[-18,30,20],true);key('#ffbf83',1.5,[15,16,25]);key('#5697e9',2.5,[15,22,-12]);
for (const side of [-1,1]) for (const [x,y,z] of [[9.2,5.1,4.35],[5.9,7.7,5.6]]) {
  const light=new PointLight('#ff943b',90,11,1.6);light.position.set(side*x!,y!,z!);scene.add(light);
}
const ground = new Mesh(new PlaneGeometry(75,60),new ShadowMaterial({ opacity:.3 }));ground.rotation.x=-Math.PI/2;ground.position.y=-.68;ground.receiveShadow=true;scene.add(ground);
const resize = () => { renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix(); };
const observer = new ResizeObserver(resize);observer.observe(host);resize();
let disposed=false,frame=0,frames=0,started=performance.now(),fps=0,renderCpuMs=0;
const metrics=() => ({fps,renderCpuMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,viewport:[host.clientWidth,host.clientHeight],pixelRatio:renderer.getPixelRatio(),gpuFrameMs:null});
function render() { if(disposed)return;controls.update();const at=performance.now();renderer.render(scene,camera);renderCpuMs=performance.now()-at;frames++;if(at-started>=1000){fps=frames*1000/(at-started);frames=0;started=at;} frame=requestAnimationFrame(render); }
render();
const loader = new GLTFLoader();
void loader.loadAsync(`${import.meta.env.BASE_URL}models/environments/miner-gate.glb`).then(gltf=>{
  if(disposed){disposeObject(gltf.scene);return;}
  gltf.scene.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(gltf.scene);
  status.textContent='Шахтёрские ворота · GLB · вращение мышью';
  Object.assign(window,{gateReview:{asset:gltf.scene,bounds:new Box3().setFromObject(gltf.scene).getSize(new Vector3()).toArray(),metrics,snapshot:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},front:()=>{camera.position.set(0,12.5,48);controls.target.set(0,10,0);controls.update();},threeQuarter:()=>{camera.position.set(24,20,43);controls.target.set(0,10,0);controls.update();}}});
}).catch(error=>{status.textContent='Не удалось загрузить GLB ворот';console.error(error);});
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();disposeObject(scene);renderer.dispose();},{once:true});
