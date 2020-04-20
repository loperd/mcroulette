/* eslint-disable */
import { CHEST_OPENED_EVENT, EventName, MODEL_LOADED_EVENT } from "@/event"
import { AnimationAction } from "three/src/animation/AnimationAction"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { ChestDefaultScene, ChestPhysicalScene } from "./Scene"
import { EventBus } from "ts-bus"
import { filter } from "lodash"
import * as THREE from "three"

import AbstractScene from "./Scene/AbstractScene"

class Chest
{
    public static DEFAULT_MODEL_FILENAME: string = "treasure-game-chest.gltf"

    private readonly nonPhysicalScene: ChestDefaultScene
    private readonly physicalScene: ChestPhysicalScene

    private requestAnimationId?: number
    private activeScene?: ChestPhysicalScene|ChestDefaultScene

    constructor(
        private renderer: THREE.WebGLRenderer,
        private loader: GLTFLoader,
        private bus: EventBus
    ) {
        this.nonPhysicalScene = new ChestDefaultScene(bus)
        this.physicalScene = new ChestPhysicalScene(bus)

        this.setupScenes()
    }

    private onChestOpened(): void
    {
        this.bus.publish(CHEST_OPENED_EVENT({ chest: this }))
    }

    public setupScenes(): void
    {
        this.bus.subscribe(EventName.MODEL_LOADED, event =>
        {
            this.nonPhysicalScene.loadModel(event.payload)
            this.physicalScene.loadModel(event.payload)
        })

        window.addEventListener('resize', () => {
            this.physicalScene.onResize(this.renderer)
            this.nonPhysicalScene.onResize(this.renderer)
        })
    }

    public loadModel(path: string): void
    {
        this.loader.load(path,
            gltf => this.load(gltf),
            undefined,
            error => console.log(error)
        )
    }

    public load({ animations, scene }: { animations: THREE.AnimationClip[], scene: THREE.Group }): void
    {
        let result: Array<THREE.Mesh | THREE.Object3D> = filter(scene.children, child =>
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
    }

    public open(): void
    {
        if (!(this.getActiveScene() instanceof ChestDefaultScene))
            throw new Error("Can not open chest, scene is not available.")

        const scene: ChestDefaultScene = <ChestDefaultScene>this.getActiveScene()
        const animationObjects: THREE.Mesh[] = scene.animationObjects

        const play: (animation: AnimationAction) => void = animation =>
        {
            animation.getRoot().visible = true
            animation.clampWhenFinished = true
            animation.setLoop(THREE.LoopOnce, 0)
                .play()
        }

        let onComplete = async () => {
            let durationTime = 0

            for (const mesh of animationObjects) {
                const animation: AnimationAction = mesh.userData.mixer
                    .clipAction(mesh.userData.animation)

                mesh.userData.clock = new THREE.Clock()

                play(animation)

                durationTime += mesh.userData.animation.duration
            }

            setTimeout(() => this.onChestOpened(), durationTime * 500)
        }

        scene.moveAndScale().onComplete(onComplete).animate()
    }

    public getActiveScene(): ChestPhysicalScene|ChestDefaultScene
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

    public play(): void
    {
        this.getActiveScene().play()
    }

    public reset(): this
    {
        if (undefined !== this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId)
        }

        this.activeScene = undefined

        this.getPhysicalScene().reset()
        this.getDefaultScene().reset()

        this.renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000))

        return this
    }

    public swapActiveScene(): this
    {
        if (undefined !== this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId)
        }

        const activeScene: ChestPhysicalScene|ChestDefaultScene|undefined = this.activeScene

        switch (true) {
            case activeScene instanceof ChestPhysicalScene:
                this.activeScene = this.getDefaultScene()
                break
            case activeScene instanceof ChestDefaultScene:
            default:
                this.activeScene = this.getPhysicalScene()
        }

        this.render()
        return this
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

        this.renderer.render(scene.getScene(), this.getActiveScene().camera)
    }
}

export { Chest }
export default Chest