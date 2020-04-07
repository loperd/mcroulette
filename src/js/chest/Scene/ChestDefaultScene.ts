import { AnimationClip, AnimationMixer, Camera, Clock, DirectionalLight, LoopOnce, Mesh, Object3D, Scene, } from "three"
import DefaultScene from "../../model/Scene/DefaultScene"

class ChestDefaultScene implements DefaultScene
{
    private scene: Scene = new Scene()
    private chestRoof: Mesh
    private chestKey: Mesh
    private chest?: Mesh
    private animations: Array<Mesh>

    constructor(private camera: Camera)
    {
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupLight(camera)
    }

    public setupScene(camera: Camera): this { return this }

    public play(): this
    {
        this.animations.forEach(obj => {
            const animation = obj.userData.mixer
                .clipAction(obj.userData.animation)

            obj.userData.clock = new Clock()

            animation.setLoop(LoopOnce, 0).play()
        })

        return this
    }

    public setupModel({ model, animations }: { model: Mesh, animations: Array<AnimationClip> }): this
    {
        this.chest = model

        const
            [chestRoofAnim, chestKeyAnim] = animations,
            [chestRoof, chestKey] = model.children

        chestRoof.userData.mixer = new AnimationMixer(chestRoof)
        chestKey.userData.mixer = new AnimationMixer(chestKey)

        chestRoof.userData.animation = chestRoofAnim
        chestKey.userData.animation = chestKeyAnim

        // this.chest.scale.set(.4, .4, .4)

        this.animations.push(<Mesh>chestRoof, <Mesh>chestKey)

        return this
    }

    public setupLight(camera: Camera): this
    {
        const
            light = new DirectionalLight(0xffffff, 0.5)

        light.position.set(50, 200, 0)

        camera.add(light)

        return this
    }

    public setupCamera(camera: Camera): this
    {
        camera.position.set(600, 150, -250)
        camera.lookAt(this.scene.position)

        return this
    }

    loadModel(loadedObjects: Array<Object3D>): this
    {
        loadedObjects.forEach(obj => {
            if ('chest_bottom' !== obj.name.toLowerCase()) {
                return this.scene.add(obj)
            }

            this.setupModel({ model: <Mesh>obj, animations: undefined})
        })

        return this;
    }
}

export default ChestDefaultScene