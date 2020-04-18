import * as THREE from "three"
import { EventBus } from "ts-bus"
import { SCENE_LOADED_EVENT } from "@/event"

abstract class AbstractScene
{
    protected camera: THREE.Camera = this.createCamera()

    abstract loadModel({ models, animations }: {
        models: THREE.Object3D[] | THREE.Mesh[],
        animations: THREE.AnimationClip[]
    }): void

    abstract setupScene(camera: THREE.Camera): this
    abstract getScene(): THREE.Scene
    abstract reset(): void

    public play(): void
    {
    }

    public createCamera(): THREE.Camera
    {
        return new THREE.PerspectiveCamera(50.0, window.innerWidth / window.innerHeight, 0.1, 1000)
    }

    public setupCamera(camera: THREE.Camera): this
    {
        camera.position.set(600, 150, -250)
        camera.lookAt(this.getScene().position)

        return this
    }

    public setupLight(camera: THREE.Camera): this
    {
        const dirLight = new THREE.DirectionalLight(0xffffff, 1)
        const ambientLight = new THREE.AmbientLight(0x404040, 1) // soft white light

        dirLight.position.set(10, 5, 0)
        ambientLight.position.set(3, 5, 0)

        camera.add(dirLight)

        this.getScene().add(dirLight)
        this.getScene().add(ambientLight)

        return this
    }

    protected sendLoadedSceneEvent(bus: EventBus): void
    {
        setTimeout(() => bus.publish(SCENE_LOADED_EVENT({ scene: this })), 500)
    }

    public getCamera(): THREE.Camera
    {
        return this.camera
    }
}

export default AbstractScene

