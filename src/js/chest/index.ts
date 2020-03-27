import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { Camera, Group, Mesh, Object3D, Vector3 } from "three"
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

    private loader: GLTFLoader
    private activeScene: Scene
    private ground: Object3D
    private camera: Camera
    private scene: Scene
    private gltf: object // object of the loaded model
    private eventBus: any // Add eventBus

    constructor(camera: Camera, gltfLoader: GLTFLoader)
    {
        this.nonPhysicalScene = new ChestDefaultScene(camera)
        this.physicalScene = new ChestPhysicalScene(camera)

        this.activeScene = this.physicalScene

        this.camera = camera
        this.loader = gltfLoader
    }

    public loadModel(): this
    {
        this.loader.load(this.MODEL_FILENAME,
            gltf => this.load,
            xhr => console.log((xhr.loaded / xhr.total * 100) + "% loaded"),
            error => console.log(error),
        )

        return this
    }

    public load(gltf): void
    {
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
        const activeScene: Scene = this.getActiveScene()

        switch (true) {
            case activeScene instanceof ChestPhysicalScene:
                this.activeScene = this.getDefaultScene()
                break
            case activeScene instanceof ChestDefaultScene:
                this.activeScene = this.getPhysicalScene()
                break
        }

        return this
    }

    public getActiveScene(): Scene
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
}

export default Chest