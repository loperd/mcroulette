import AbstractScene from "./AbstractScene"
import { ScaleMove } from "../Animation"
import * as THREE from "three"

class ChestDefaultScene extends AbstractScene
{
    public animationObjects: THREE.Mesh[] = new Array<THREE.Mesh>()

    private static OBJECT_NAME: string = "Chest_bottom"
    private _animations?: THREE.AnimationClip[]

    private scene: THREE.Scene = new THREE.Scene()
    private _chest?: THREE.Mesh

    constructor(private camera: THREE.Camera)
    {
        super()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupLight(camera)
    }

    get animations(): THREE.AnimationClip[]
    {
        if (undefined === this._animations) {
            throw new Error('Animations was not setup.')
        }

        return this._animations
    }

    get chest(): THREE.Mesh
    {
        if (undefined === this._chest) {
            throw new Error('Chest was not defined.')
        }

        return this._chest
    }

    public reset(): void
    {
        this.animationObjects = new Array<THREE.Mesh>()
        this.scene = new THREE.Scene()
        this.constructor(this.camera)

        const chest = this.chest.clone()

        this.setupAnimations(chest)
        this.setupModel(chest)
    }

    public setupScene(camera: THREE.Camera): this
    {
        this.scene.add(camera)
        return this
    }

    public getScene = (): THREE.Scene => this.scene

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

    public setupModel(chest: THREE.Mesh): this
    {
        chest.position.set(-3.80780029296875, 1.1276047229766846, -6.184289932250977)
        chest.rotation.set(1.5708281206194878, -0.0000031430918714433056, -0.06824258068266337)
        chest.scale.set(.4, .4, .4)

        this.scene.add(chest)
        return this
    }

    private setupAnimations(chest: THREE.Mesh): void
    {
        const
            [chestRoofClip, chestKeyClip] = this.animations,
            [chestRoof, chestKey] = <THREE.Mesh[]>chest.children

        chestRoof.userData.mixer = new THREE.AnimationMixer(chestRoof)
        chestKey.userData.mixer = new THREE.AnimationMixer(chestKey)
        chestKey.userData.animation = chestKeyClip
        chestRoof.userData.animation = chestRoofClip

        this.animationObjects.push(chestRoof, chestKey)
    }

    public loadModel({ models, animations }: { models: THREE.Object3D[] | THREE.Mesh[], animations: THREE.AnimationClip[] }): void
    {
        const [model] = <THREE.Mesh[]>models

        model.children[1].visible = false

        this._chest = model
        this._animations = animations

        const chest = model.clone()

        this.setupAnimations(chest)
        this.setupModel(chest)
    }
}

export default ChestDefaultScene