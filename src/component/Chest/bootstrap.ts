// eslint-disable-next-line
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import * as THREE from "three"

const
    camera = new THREE.PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000),
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
    loader = new GLTFLoader()

loader.setPath("/models/")

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0fffff, 0)

export {
    camera,
    renderer,
    loader
}