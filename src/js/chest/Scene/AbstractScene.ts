import { AmbientLight, Camera, DirectionalLight, Mesh, Scene } from "three"
import { Scene as ModelScene } from "../../model/Scene"

abstract class AbstractScene implements ModelScene
{
    setupModel(model: Mesh): this { throw new Error("Method not implemented.") }

    setupScene(camera: Camera): this { throw new Error("Method not implemented.") }

    loadModel({}): void { throw new Error("Method not implemented.") }

    getScene(): Scene { throw new Error("Method not implemented.") }

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

