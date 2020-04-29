// eslint-disable-next-line
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import * as THREE from "three"

const
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
    loader = new GLTFLoader(),
    dracoLoader = new DRACOLoader()

dracoLoader.setDecoderPath('/static/draco/')

loader.setPath("/models/")
loader.setDRACOLoader(dracoLoader)

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0fffff, 0)

export {
    renderer,
    loader
}