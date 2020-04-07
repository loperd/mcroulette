import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { AnimationClip, Camera, Group, Mesh, Object3D, WebGLRenderer } from "three"
import { ChestDefaultScene, ChestPhysicalScene } from "./Scene"
import { DefaultScene, PhysicalScene, Scene } from "../model/Scene"

import { autoInjectable } from "tsyringe"
import { EventName, modelLoaded } from "../event"
import { EventBus } from "ts-bus"
import { filter } from "lodash"

import Model from "../model/Model"

@autoInjectable()
class Chest implements Model
{
    public static DEFAULT_MODEL_FILENAME: string = "treasure-game-chest.glb"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private animations: Array<Object3D>
    private requestAnimationId: number
    private activeScene: DefaultScene|PhysicalScene

    constructor(
        private readonly camera: Camera,
        private renderer: WebGLRenderer,
        private loader: GLTFLoader,
        private bus: EventBus
    ) {
        this.nonPhysicalScene = new ChestDefaultScene(camera, bus)
        this.physicalScene = new ChestPhysicalScene(camera, bus)

        this.swapActiveScene()
        this.subscribeScenes()
    }

    public subscribeScenes(): void
    {
        this.bus.subscribe(EventName.LOADED_MODEL, event => {
            this.nonPhysicalScene.loadModel(event.payload)
            this.physicalScene.loadModel(event.payload)
        });
    }

    public loadModel(path: string): void
    {
        this.loader.load(path,
            gltf => this.load(gltf),
            undefined,
            error => console.log(error)
        )
    }

    public load({ animations, scene }: { animations: AnimationClip[], scene: Group }): void
    {
        let result: Mesh[] = filter(scene.children, child =>
        {
            switch (child.name.toLowerCase()) {
                case "chest_bottom":
                case "sun":
                    return true
            }

            return false
        })

        this.bus.publish(modelLoaded({ models: result, animations: animations }))
    }

    public swapActiveScene(): void
    {
        const activeScene: Scene = this.getActiveScene()

        switch (true) {
            case activeScene instanceof ChestPhysicalScene:
                this.activeScene = this.getDefaultScene()
                break
            case activeScene instanceof ChestDefaultScene:
            default:
                this.activeScene = this.getPhysicalScene()
        }
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
        this.requestAnimationId = requestAnimationFrame(_ => this.render)

        this.renderer.render(this.getActiveScene().getScene(), this.getCamera())

        return this
    }
}

export default Chest