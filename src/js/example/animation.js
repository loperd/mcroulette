const animationsObjects = [];
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const container = document.getElementById('Scene');
const renderer = new THREE.WebGLRenderer({
    antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, 1, 200, 2000);
camera.position.set(0, 400, 700);
scene.add(camera);


scene.add(new THREE.AmbientLight(0xf0f0f0));
let light = new THREE.SpotLight(0xffffff, 1.5);
light.position.set(0, 1500, 200);
light.castShadow = true;
scene.add(light);

let planeGeometry = new THREE.PlaneBufferGeometry(2000, 2000);
planeGeometry.rotateX(-Math.PI / 2);
const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });

const  plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.position.y = 0;
plane.receiveShadow = true;
scene.add(plane);

const helper = new THREE.GridHelper(2000, 100);
helper.position.y = 0;
helper.material.opacity = 0.25;
helper.material.transparent = true;
scene.add(helper);

const geometry = new THREE.SphereGeometry(50, 30, 30);
const material = new THREE.MeshPhongMaterial({
    color: 0xcad16a
});
const mesh = new THREE.Mesh(geometry, material);
mesh.position.copy(new THREE.Vector3(0, 20, 0));
scene.add(mesh);

animate();

createMoveAnimation({
    mesh,
    startPosition: new THREE.Vector3(0, window.innerHeight, 0),
    endPosition: new THREE.Vector3(0, 0, 0)
})

function animate() {
    requestAnimationFrame(animate);
    threeRender();
}

function createMoveAnimation({
    mesh,
    startPosition,
    endPosition
}) {
    mesh.userData.mixer = new THREE.AnimationMixer(mesh);
    let track = new THREE.VectorKeyframeTrack(
        '.position', [0, 1, 2], [
            startPosition.x,
            startPosition.y,
            startPosition.z,
            endPosition.x,
            endPosition.y,
            endPosition.z,
        ]
    );
    const animationClip = new THREE.AnimationClip(null, 5, [track]);
    const animationAction = mesh.userData.mixer.clipAction(animationClip);
    animationAction.setLoop(THREE.LoopOnce);
    animationAction.play();
    mesh.userData.clock = new THREE.Clock();
    animationsObjects.push(mesh);
}


function threeRender() {
    renderer.render(scene, camera);

    animationsObjects.forEach(mesh => {
        if (mesh.userData.clock && mesh.userData.mixer) {
            mesh.userData.mixer.update(mesh.userData.clock.getDelta());
        }
    });
};
