import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import Physijs from "physijs-webpack"
import * as THREE from "three"
import "../styles/main.styl"
import Circle from "./circle"
import * as __ from "lodash"

import Chest from "./chest"

window.onload = _ => {
    new Circle("circle", .15).draw()

    const loader = new GLTFLoader().setPath("/models/")
    const clock = new THREE.Clock()
    const animationsObjects = []

    let ground, camera, scene, renderer, physicalChest, key, chestMixer, keyMixer

    function init() {
        camera = new THREE.PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000)

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.setClearColor(0x0fffff, 0)

        scene = new Physijs.Scene
        scene.setGravity(new THREE.Vector3(10, -700, 10))
        scene.addEventListener("update", _ => scene.simulate(undefined, 1))
        scene.add(camera)

        const light = new THREE.DirectionalLight(0xffffff, 0.5)

        light.position.set(50, 200, 0)
        camera.position.set(600, 150, -250)

        camera.lookAt(scene.position)
        camera.add(light)

        const material = Physijs.createMaterial(new THREE.MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        }), 1, 1)

        ground = new Physijs.BoxMesh(new THREE.BoxGeometry(500, 1, 500), material, 0)
        ground.position.y += 50
        scene.add(ground)

        loader.load("treasure-game-chest.glb",
            gltf => loadCase(gltf),
            xhr => console.log((xhr.loaded / xhr.total * 100) + "% loaded"),
            error => console.log(error),
        )
        scene.simulate()

        requestAnimationFrame(render)
    }

    let chest, chestRoof, chestKey

    function createCopyChest(ch, animations) {
        chest = ch

        chestRoof = chest.children[0]
        chestKey = chest.children[1]

        chestRoof.userData.mixer = new THREE.AnimationMixer(chestRoof)
        chestRoof.userData.animation = animations[0]
        chestKey.userData.mixer = new THREE.AnimationMixer(chestKey)
        chestKey.userData.animation = animations[1]

        animationsObjects.push(chestRoof, chestKey)
    }

    function updateCopyChest(oldChest) {
        chest.position.set(oldChest.position.x, oldChest.position.y, oldChest.position.z)
        chest.rotation.set(oldChest.rotation.x, oldChest.rotation.y, oldChest.rotation.z)
        chest.scale.set(oldChest.scale.x, oldChest.scale.y, oldChest.scale.z)
    }

    function loadCase(gltf) {
        const tr = child => {
            if ("undefined" === typeof child)
                return

            switch (child.name.toLowerCase()) {
                case "chest_bottom":
                    physicalChest = convertThreeMeshToPhysi(child, 1, .2)

                    const chestTop = convertThreeMeshToPhysi(child.children[0])
                    chestTop.position.set(-119.91560363769531, 0.000023036218408378772, -159.01849365234375)
                    chestTop.rotation.set(0, 0, 0)
                    chestTop.parent = physicalChest
                    physicalChest.add(chestTop)

                    let objKey = child.children[1]
                    let
                        geometry = new THREE.Geometry().fromBufferGeometry(objKey.geometry),
                        material = Physijs.createMaterial(objKey.material)

                    key = new Physijs.CapsuleMesh(geometry, material, 0)
                    key.castShadow = true
                    key.receiveShadow = true
                    key.parent = physicalChest

                    physicalChest.position.set(0, 400, 0)
                    physicalChest.rotation.set(d(90), d(0), d(0))

                    physicalChest.rotation.x += d(5)
                    physicalChest.rotation.y += d(0)
                    physicalChest.rotation.z += d(0)

                    physicalChest.scale.set(.4, .4, .4)

                    scene.add(physicalChest)
                    return
                case "sun":
                    scene.add(child)
                    return
            }
        }

        __.forEach(gltf.scene.children, tr)

        setTimeout(_ => {
            scene.removeEventListener("update")

            // createMoveAndScaleAnimation({
            //     mesh: chest,
            //     endPosition: new THREE.Vector3(
            //         chest.position.x,
            //         chest.position.y - 100,
            //         chest.position.z
            //     )
            // })

            scene.add(chest)
            scene.remove(physicalChest)

            console.log(chestKey, chestRoof)

            const
                chestKeyAnim  = chestKey.animations[0],
                chestRoofAnim = chestRoof.animations[0]

            setTimeout(
                _ => {
                    let animation = keyMixer.clipAction(chestKeyAnim)
                    animation.setLoop(THREE.LoopOnce)
                    animation.clampWhenFinished = true
                    animation.enable = true

                    animation.play()
                }
                , 2000)


            setTimeout(
                _ => {
                    let animation = chestRoof.clipAction(chestRoofAnim).play()
                    animation.setLoop(THREE.LoopOnce)
                    animation.clampWhenFinished = true
                    animation.enable = true
                    animation.play()
                    chestRoof.userData.clock = new THREE.Clock()
                },
                chestKeyAnim.duration * 500,
            )
        }, 5000)

        render()
    }

    function convertThreeMeshToPhysi(obj, friction = 0, restitution = 0, mass = undefined) {
        let
            geometry = new THREE.Geometry().fromBufferGeometry(obj.geometry),
            material = Physijs.createMaterial(obj.material, friction, restitution)

        return new Physijs.ConvexMesh(geometry, material, mass)
    }

    function d(number) {
        return number * Math.PI / 180
    }

    function render() {
        requestAnimationFrame(render)

        const delta = clock.getDelta()

        animationsObjects.forEach(mesh => {
            if (mesh.userData.clock && mesh.userData.mixer) {
                mesh.userData.mixer.update(mesh.userData.clock.getDelta())
            }
        })

        renderer.render(scene, camera)
    }

    function renderDom() {
        const rendererEl = renderer.domElement
        rendererEl.setAttribute("id", "case")
        document.body.appendChild(rendererEl)
    }

    function createMoveAndScaleAnimation({
        mesh,
        endPosition,
    }) {
        mesh.userData.mixer = new THREE.AnimationMixer(mesh)
        let startMovePosition = mesh.position
        let startScaleValue = mesh.scale
        let trackMove = new THREE.VectorKeyframeTrack(
            ".position", [0, 1, 2], [
                startMovePosition.x,
                startMovePosition.y,
                startMovePosition.z,
                endPosition.x,
                endPosition.y,
                endPosition.z,
            ],
        )
        let trackScale = new THREE.VectorKeyframeTrack(
            ".scale", [0, 1, 2], [
                startScaleValue.x,
                startScaleValue.y,
                startScaleValue.z,
                endPosition.x,
                endPosition.y,
                endPosition.z,
            ],
        )
        const animationClip = new THREE.AnimationClip(null, 5, [trackMove])
        const animationAction = mesh.userData.mixer.clipAction(animationClip)
        animationAction.setLoop(THREE.LoopOnce)
        animationAction.play()
        mesh.userData.clock = new THREE.Clock()
        animationsObjects.push(mesh)
    }

    // document.onmousedown = e => {
    //     cameraParams.mdown.set(e.clientX, e.clientY);
    //     cameraParams.thetam = cameraParams.theta;
    //     cameraParams.phim = cameraParams.phi;
    //
    //     document.onmousemove = function(e) {
    //         cameraParams.mmove.set(e.clientX, e.clientY);
    //         cameraParams.theta = -(cameraParams.mmove.x - cameraParams.mdown.x) * 0.5 + cameraParams.thetam;
    //         cameraParams.phi = (cameraParams.mmove.y - cameraParams.mdown.y) * 0.5 + cameraParams.phim;
    //         cameraParams.phi = Math.min(90, Math.max(-90, cameraParams.phi));
    //
    //         console.log((({mmove, theta, phi}) => ({mmove, theta, phi}))(cameraParams))
    //
    //         updateCamera();
    //     };
    //
    //     document.onmouseup = e => {
    //         document.onmousemove = null;
    //     };
    // };

    init()
    renderDom()
}