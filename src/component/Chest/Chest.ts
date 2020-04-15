import { EventName, CHEST_OPENED_EVENT, CHEST_OPEN_EVENT, MODEL_LOADED_EVENT } from "@/event"
import { AnimationAction } from "three/src/animation/AnimationAction"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { ChestDefaultScene, ChestPhysicalScene } from "./Scene"
import { EventBus } from "ts-bus"
import { filter } from "lodash"
import {
    AnimationClip,
    LoopOnce,
    Camera,
    Clock,
    Group,
    Mesh,
    Object3D,
    Scene,
    WebGLRenderer
} from "three"

import AbstractScene from "./Scene/AbstractScene"

class Chest
{
    public static DEFAULT_MODEL_FILENAME: string = "treasure-game-chest.glb"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private requestAnimationId?: number
    private activeScene?: AbstractScene

    constructor(
        private readonly camera: Camera,
        private renderer: WebGLRenderer,
        private loader: GLTFLoader,
        private bus: EventBus
    ) {
        this.nonPhysicalScene = new ChestDefaultScene(this.camera)
        this.physicalScene = new ChestPhysicalScene(this.camera)

        this.subscribeScenesOnLoadModel()
    }

    private onChestOpened(): void
    {
        this.bus.publish(CHEST_OPENED_EVENT({ chest: this }))
    }

    private onChestOpen(): void
    {
        this.bus.publish(CHEST_OPEN_EVENT({ chest: this }))
    }

    public subscribeScenesOnLoadModel(): void
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

    public open(): void
    {
        if (!(this.getActiveScene() instanceof ChestDefaultScene))
            throw new Error("Can not open chest, scene is not available.")

        const scene: ChestDefaultScene = <ChestDefaultScene>this.getActiveScene()
        const animationObjects: Mesh[] = scene.animationObjects

        const play: (animation: AnimationAction) => void = animation =>
        {
            animation.getRoot().visible = true
            animation.clampWhenFinished = true
            animation.setLoop(LoopOnce, 0)
                .play()
        }

        let onComplete = async _ => {
            let durationTime = 0

            for (const mesh of animationObjects) {
                const animation: AnimationAction = mesh.userData.mixer
                    .clipAction(mesh.userData.animation)

                mesh.userData.clock = new Clock()

                play(animation)

                durationTime += mesh.userData.animation.duration
            }

            setTimeout(() => this.onChestOpened(), durationTime * 500)
        }

        scene.moveAndScale().onComplete(onComplete).animate()
    }

    public getActiveScene(): AbstractScene
    {
        if (undefined === this.activeScene) {
            throw new Error('Chest.activeScene was not defined.')
        }

        return this.activeScene
    }

    public getPhysicalScene(): ChestPhysicalScene
    {
        return this.physicalScene
    }

    public getDefaultScene(): ChestDefaultScene
    {
        return this.nonPhysicalScene
    }

    private getCamera(): Camera
    {
        return this.camera
    }

    public reset(): this
    {
        if (undefined !== this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId)
        }

        this.activeScene = undefined

        this.getPhysicalScene().reset()
        this.getDefaultScene().reset()

        this.renderer.render(new Scene(), this.getCamera())

        return this
    }

    public play(): void
    {
        this.activeScene?.play()
    }


    public swapActiveScene(): void
    {
        if (undefined !== this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId)
        }

        const activeScene: AbstractScene|undefined = this.activeScene

        switch (true) {
            case activeScene instanceof ChestPhysicalScene:
                this.activeScene = this.getDefaultScene()
                break
            case activeScene instanceof ChestDefaultScene:
            default:
                this.activeScene = this.getPhysicalScene()
        }

        this.render()
    }

    public render(): void
    {
        this.requestAnimationId = requestAnimationFrame(() => this.render())

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