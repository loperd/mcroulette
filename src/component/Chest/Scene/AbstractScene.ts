import * as THREE from "three"
import { EventBus } from "ts-bus"
import { SCENE_LOADED_EVENT } from "@/event"

abstract class AbstractScene
{
    protected _camera: THREE.PerspectiveCamera = this.createCamera()

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

    public onResize(renderer: THREE.WebGLRenderer): void
    {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()

        renderer.setSize(window.innerWidth, window.innerHeight)

    }

    public createCamera(): THREE.PerspectiveCamera
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

    public get camera(): THREE.PerspectiveCamera
    {
        if (undefined === this._camera)
            this._camera =  this.createCamera()

        return this._camera
    }
}

export default AbstractScene

