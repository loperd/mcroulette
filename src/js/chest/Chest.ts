import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { Camera, Mesh, Object3D, WebGLRenderer } from "three"
import { ChestPhysicalScene, ChestDefaultScene} from "./Scene"
import { DefaultScene, PhysicalScene } from "../model/Scene"

import { Scene } from "physijs-webpack"
import Model from "../model/Model"
import { filter } from 'lodash';

class Chest implements Model
{
    public static DEFAULT_MODEL_FILENAME: string = "treasure-game-chest.glb"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private animations: Array<Object3D>
    private requestAnimationId: number
    private activeScene: Scene
    private scene: Scene

    constructor(
        private readonly camera: Camera,
        private renderer: WebGLRenderer,
        private loader: GLTFLoader
    ) {
        this.nonPhysicalScene = new ChestDefaultScene(camera)
        this.physicalScene = new ChestPhysicalScene(camera)

        this.swapActiveScene()
    }

    public loadModel(path: string): void
    {
        this.loader.load(
            path,
            this.load,
            undefined,
            error => console.log(error)
        )
    }

    public load(gltf: object): void
    {
        // @ts-ignore
        let result: Array<Mesh> = filter(gltf.scene.children, child =>
        {
            switch (child.name.toLowerCase()) {
                case "chest_bottom":
                case "sun":
                    return true
            }

            return false
        })

        console.log(result)

        // this._eventDispatcher.dispatch(result)
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