import { AmbientLight, AnimationClip, Camera, DirectionalLight, Mesh, Object3D, Scene } from "three"

abstract class AbstractScene
{
    abstract loadModel({ models, animations }: {
        models: Object3D[] | Mesh[],
        animations: AnimationClip[]
    }): void

    abstract setupScene(camera: Camera): this
    abstract getScene(): Scene
    abstract reset(): void

    public play(): void
    {
    }

    public setupCamera(camera: Camera): this
    {
        camera.position.set(600, 150, -250)
        camera.lookAt(this.getScene().position)

        return this
    }

    public setupLight(camera: Camera): this
    {
        const dirLight = new DirectionalLight(0xffffff, 1)
        const ambientLight = new AmbientLight(0x404040, 1) // soft white light

        dirLight.position.set(10, 5, 0)
        ambientLight.position.set(3, 5, 0)

        camera.add(dirLight)

        this.getScene().add(dirLight)
        this.getScene().add(ambientLight)

        return this
    }
}

export default AbstractScene

