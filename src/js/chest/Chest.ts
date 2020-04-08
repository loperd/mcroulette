import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import {
    AnimationClip,
    Camera,
    Clock,
    Group,
    LoopOnce,
    Mesh,
    Object3D,
    WebGLRenderer,
    Scene as ThreeScene
} from "three"
import { ChestDefaultScene, ChestPhysicalScene } from "./Scene"
import { DefaultScene, PhysicalScene, Scene } from "../model/Scene"

import { CHEST_OPENED_EVENT, EventName, MODEL_LOADED_EVENT } from "../event"
import { EventBus } from "ts-bus"
import { filter } from "lodash"

import Model from "../model/Model"
import { AnimationAction } from "three/src/animation/AnimationAction"
import { defer } from "../model/helper"

class Chest implements Model
{
    public static DEFAULT_MODEL_FILENAME: string = "treasure-game-chest.glb"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private animations: Array<Object3D>
    private activeScene: DefaultScene | PhysicalScene

    private requestAnimationId: number

    constructor(
        private readonly camera: Camera,
        private renderer: WebGLRenderer,
        private loader: GLTFLoader,
        private bus: EventBus
    )
    {
        this.nonPhysicalScene = new ChestDefaultScene(this.camera)
        this.physicalScene = new ChestPhysicalScene(this.camera)

        this.subscribeScenes()
    }

    public subscribeScenes(): void
    {
        this.bus.subscribe(EventName.MODEL_LOADED, event =>
        {
            this.nonPhysicalScene.loadModel(event.payload)
            this.physicalScene.loadModel(event.payload)
        })
    }

    public async loadModel(path: string)
    {
        this.loader.load(path,
            async gltf => await this.load(gltf),
            undefined,
            error => console.log(error)
        )
    }

    public async load({ animations, scene }: { animations: AnimationClip[], scene: Group }): Promise<void>
    {
        let result: Array<Mesh | Object3D> = filter(scene.children, child =>
        {
            if (child === undefined)
                return false

            switch (child.name.toLowerCase()) {
                case "chest_bottom":
                    return true
            }

            return false
        })

        this.bus.publish(MODEL_LOADED_EVENT({ models: result, animations: animations }))

        return Promise.resolve()
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

    public async scaleAndMove(): Promise<void>
    {
        if (!(this.getActiveScene() instanceof ChestDefaultScene))
            throw new Error("Can not open chest, scene is not available.")



        await new Promise(resolve => resolve())
    }

    public async open(callback?: (_?) => void): Promise<void>
    {
        if (!(this.getActiveScene() instanceof ChestDefaultScene))
            throw new Error("Can not open chest, scene is not available.")

        const scene: ChestDefaultScene = <ChestDefaultScene>this.getActiveScene()
        const animationObjects: Mesh[] = scene.animationObjects

        const play: (animation: AnimationAction) => void = animation =>
        {
            animation.getRoot().visible = true
            animation.clampWhenFinished = true
            animation.setLoop(LoopOnce, undefined)
                .play()
        }

        let durationTime = 0

        for (const mesh of animationObjects) {
            const animation: AnimationAction = mesh.userData.mixer
                .clipAction(mesh.userData.animation)

            mesh.userData.clock = new Clock()

            play(animation)

            durationTime += mesh.userData.animation.duration
        }

        await defer(durationTime * 500, _ =>
        {
            callback(); this.sendChestOpenedEvent()
        })
    }

    public sendChestOpenedEvent(): void
    {
        this.bus.publish(CHEST_OPENED_EVENT({ chest: this }))
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

    public reset(): this
    {
        cancelAnimationFrame(this.requestAnimationId)

        this.activeScene = undefined

        this.renderer.render(new ThreeScene(), this.getCamera())

        return this
    }

    public reRender(): this
    {
        cancelAnimationFrame(this.requestAnimationId)

        this.render()

        return this
    }

    public render(): void
    {
        this.requestAnimationId = requestAnimationFrame(_ => this.render())

        const scene = this.getActiveScene()

        if (scene instanceof ChestDefaultScene) {
            scene.animationObjects.forEach(mesh =>
            {
                if (mesh.userData.clock && mesh.userData.mixer) {
                    mesh.userData.mixer.update(mesh.userData.clock.getDelta())
                }
            })
        }

        this.renderer.render(scene.getScene(), this.getCamera())
    }
}

export default Chest