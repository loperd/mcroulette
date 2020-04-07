import { AnimationClip, Camera, Mesh, Object3D } from "three"

interface Scene
{
    setupModel({ model, animations }: { animations: Array<AnimationClip>, model: Mesh }): this
    setupCamera(camera: Camera): this
    setupScene(camera: Camera): this
    setupLight(camera: Camera): this
    loadModel(loadedObjects: Array<Object3D>): this
}

export default Scene