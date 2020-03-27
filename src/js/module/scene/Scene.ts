import { Camera } from "three"

interface Scene
{
    setupCamera(camera: Camera): this
    setupScene(camera: Camera): this
}

export default Scene