// eslint-disable-next-line
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import * as THREE from "three"

const
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
    dracoLoader = new DRACOLoader(),
    loader = new GLTFLoader()

dracoLoader.setDecoderPath('/static/draco/')
loader.setDRACOLoader(dracoLoader)
loader.setPath("/models/")

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0fffff, 0)

export {
    renderer,
    loader
}