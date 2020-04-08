import { AnimationClip, AnimationMixer, Camera, Mesh, Object3D, Scene, } from "three"
import AbstractScene from "./AbstractScene"
import { ScaleMove } from "../Animation"

class ChestDefaultScene extends AbstractScene
{
    public animationObjects: Mesh[] = new Array<Mesh>()

    private static OBJECT_NAME: string = "Chest_bottom"

    private scene: Scene = new Scene()
    private chestRoof: Mesh
    private chestKey: Mesh
    private chest?: Mesh
    private animations: AnimationClip[]

    constructor(private camera: Camera)
    {
        super()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupLight(camera)
    }

    public play(): void
    {
        throw new Error("Method not implemented.")
    }

    public reset(): void
    {
        this.animationObjects = new Array<Mesh>()
        this.scene = new Scene()
        this.constructor(this.camera)

        const chest = this.chest.clone()

        this.setupAnimations(chest)
        this.setupModel(chest)
    }

    public setupScene(camera: Camera): this
    {
        this.scene.add(camera)
        return this
    }

    public getScene(): Scene
    {
        return this.scene
    }

    public moveAndScale(): ScaleMove
    {
        const chest = this.scene.getObjectByName(ChestDefaultScene.OBJECT_NAME)

        if (chest === undefined) {
            throw Error("Cannot find object for animate it.")
        }

        const endPosition = chest.position.clone()

        endPosition.y -= 130

        return new ScaleMove(chest, endPosition)
    }

    public setupModel(chest: Mesh): this
    {
        chest.position.set(-3.80780029296875, 1.1276047229766846, -6.184289932250977)
        chest.rotation.set(1.5708281206194878, -0.0000031430918714433056, -0.06824258068266337)
        chest.scale.set(.4, .4, .4)

        this.scene.add(chest)
        return this
    }

    private setupAnimations(chest: Mesh): void
    {
        const [chestRoofClip, chestKeyClip] = this.animations
        const [chestRoof, chestKey] = <Mesh[]>chest.children

        chestRoof.userData.mixer = new AnimationMixer(chestRoof)
        chestKey.userData.mixer = new AnimationMixer(chestKey)
        chestKey.userData.animation = chestKeyClip
        chestRoof.userData.animation = chestRoofClip

        this.animationObjects.push(chestRoof, chestKey)
    }

    public loadModel({ models, animations }: { models: Object3D[] | Mesh[], animations: AnimationClip[] }): void
    {
        const [chestRoofClip, chestKeyClip] = animations
        const [model] = <Mesh[]>models

        model.children[1].visible = false

        this.chest = model
        this.animations = animations

        const chest = model.clone()

        this.setupAnimations(chest)
        this.setupModel(chest)
    }
}

export default ChestDefaultScene