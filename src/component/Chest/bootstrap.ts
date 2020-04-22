// eslint-disable-next-line
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import * as THREE from "three"

const
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
    loader = new GLTFLoader()

loader.setPath("/models/")

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0fffff, 0)

export {
    renderer,
    loader
}