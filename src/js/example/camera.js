let camera, scene, renderer, light, cube, sphere;

let cameraParams = {
    distance: 1,
    mdown: new THREE.Vector2(),
    mmove: new THREE.Vector2(),
    phi: 25,
    theta: -15,
    phim: 0,
    thetam: 0,
    fov: 53
};

let updateCamera = function() {
    camera.position.x = cameraParams.distance * Math.sin(cameraParams.theta * degToRad) * Math.cos(cameraParams.phi * degToRad);
    camera.position.y = cameraParams.distance * Math.sin(cameraParams.phi * degToRad);
    camera.position.z = cameraParams.distance * Math.cos(cameraParams.theta * degToRad) * Math.cos(cameraParams.phi * degToRad);

    camera.lookAt(cube.position);
};
const degToRad = Math.PI / 180;

function init() {
    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer.setClearColor(0xffffff);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
}

function initScene() {
    let cubeGeom = new THREE.BoxGeometry(60, 60, 60);
    let cubeMat = new THREE.MeshPhongMaterial({
        color: 0xaa0000
    });
    cube = new THREE.Mesh(cubeGeom, cubeMat);
    cube.position.set(-100, 0, 0);
    scene.add(cube);

    let sphereGeom = new THREE.SphereGeometry(45, 60, 60);
    let sphereMat = new THREE.MeshPhongMaterial({
        color: 0x0000ff
    });
    sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.set(100, 0, 0);
    scene.add(sphere);

    let plane = new THREE.GridHelper(250, 25);
    scene.add(plane);

    light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(-25, 50, 50);
    scene.add(camera);
    camera.add(light);

    camera.position.set(0, 0, 500);
    cameraParams.distance = camera.position.clone().sub(cube.position).length();
    updateCamera();
}

function render() {
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

document.onmousedown = function(e) {
    cameraParams.mdown.set(e.clientX, e.clientY);
    cameraParams.thetam = cameraParams.theta;
    cameraParams.phim = cameraParams.phi;

    document.onmousemove = function(e) {
        cameraParams.mmove.set(e.clientX, e.clientY);
        cameraParams.theta = -(cameraParams.mmove.x - cameraParams.mdown.x) * 0.5 + cameraParams.thetam;
        cameraParams.phi = (cameraParams.mmove.y - cameraParams.mdown.y) * 0.5 + cameraParams.phim;
        cameraParams.phi = Math.min(90, Math.max(-90, cameraParams.phi));

        updateCamera();
    };

    document.onmouseup = function(e) {
        document.onmousemove = null;
    };
};



init();
initScene();
render();