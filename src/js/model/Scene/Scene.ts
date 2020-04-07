import { AnimationClip, Camera, Mesh, Object3D, Scene as ThreeScene } from "three"

interface Scene
{
    setupModel({ model, animations }: { animations: Array<AnimationClip>, model: Mesh }): this
    setupCamera(camera: Camera): this
    setupScene(camera: Camera): this
    setupLight(camera: Camera): this
    loadModel({models, animations}: { models: Object3D[]|Mesh[], animations: AnimationClip[] }): void
    getScene(): ThreeScene
}

export default Scene