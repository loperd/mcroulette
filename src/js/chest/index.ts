import { Camera, Mesh, Object3D, Vector3, WebGLRenderer } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import PhysicalScene from "../module/scene/PhysicalScene"
import DefaultScene from "../module/scene/DefaultScene"
import ChestPhysicalScene from "./ChestPhysicalScene"
import ChestDefaultScene from "./ChestDefaultScene"
import { Scene } from "physijs-webpack"
import Module from "../module/Module"
import __ from "lodash"

class Chest implements Module
{
    private readonly MODEL_FILENAME = "treasure-game-chest.glb"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private animations: Array<Object3D>

    private requestAnimationId: number
    private readonly camera: Camera
    private renderer: WebGLRenderer
    private loader: GLTFLoader
    private activeScene: Scene
    private scene: Scene
    private gltf: object // object of the loaded model
    private eventBus: any // Add eventBus

    constructor(renderer: WebGLRenderer, camera: Camera, gltfLoader: GLTFLoader)
    {
        this.nonPhysicalScene = new ChestDefaultScene(camera)
        this.physicalScene = new ChestPhysicalScene(camera)

        this.camera = camera
        this.loader = gltfLoader
        this.renderer = renderer

        this.swapActiveScene()
    }

    public loadModel(): this
    {
        this.loader.load(this.MODEL_FILENAME, this.load,
            xhr => console.log((xhr.loaded / xhr.total * 100) + "% loaded"),
            error => console.log(error),
        )

        return this
    }

    public load(gltf): void
    {
        this.gltf = gltf

        let result: Array<Mesh> = __.filter(gltf.scene.children, child =>
        {
            switch (child.name.toLowerCase()) {
                case "chest_bottom":
                case "sun":
                    return true
            }

            return false
        })


        this.eventBus.publish("loadModel", result)
    }

    public changePosition(position: Vector3): this
    {

        return this
    }

    public rotate(vector: Vector3): this
    {

        return this
    }

    public swapActiveScene(): this
    {
        const activeScene: Scene|null = this.getActiveScene()

        switch (true) {
            case activeScene instanceof ChestPhysicalScene:
                this.activeScene = this.getDefaultScene()
                break
            case activeScene instanceof ChestDefaultScene:
            default:
                this.activeScene = this.getPhysicalScene()
        }

        return this
    }

    public getActiveScene(): Scene|null
    {
        return this.activeScene
    }

    public getPhysicalScene(): PhysicalScene
    {
        return this.physicalScene
    }

    public getDefaultScene(): DefaultScene
    {
        return this.nonPhysicalScene
    }

    private getCamera(): Camera
    {
        return this.camera
    }

    public reRender(): this
    {
        cancelAnimationFrame(this.requestAnimationId)

        this.render()

        return this
    }

    public render(): this
    {
        this.requestAnimationId = requestAnimationFrame(this.render);
        this.renderer.render(
            this.getActiveScene(),
            this.getCamera()
        )

        return this
    }
}

export default Chest