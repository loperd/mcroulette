import * as THREE from "three"

abstract class AbstractScene
{
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
}

export default AbstractScene

