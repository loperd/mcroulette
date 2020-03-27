import Scene from "../module/scene/Scene"
import { Camera, Scene as ThreeScene } from "three"

class ChestDefaultScene implements Scene
{
    private camera: Camera
    private scene: ThreeScene

    constructor(camera: Camera)
    {
        this.scene = new ThreeScene()

        this.camera = camera
    }

    setupCamera(camera: Camera): this
    {
        return this
    }

    setupScene(camera: Camera): this
    {
        return this
    }
}

export default ChestDefaultScene