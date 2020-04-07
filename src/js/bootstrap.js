import "reflect-metadata"

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { PerspectiveCamera, WebGLRenderer } from "three"
import { EventBus } from "ts-bus"
import { container } from "tsyringe"

const
    camera   = new PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000),
    renderer = new WebGLRenderer({ antialias: true, alpha: true }),
    loader   = new GLTFLoader(),
    bus = new EventBus()

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0fffff, 0)

loader.setPath("/models/")

container.register(EventBus, { useValue: bus })
container.register(PerspectiveCamera, { useValue: camera })
container.register(GLTFLoader, { useValue: loader })
container.register(WebGLRenderer, { useValue: renderer })

export {
    camera,
    renderer,
    loader,
    container,
}