import AbstractScene from "./AbstractScene"
import { ScaleMove } from "../Animation"
import * as THREE from "three"
import { Service } from "vue-di-container"
import { EventBus } from "ts-bus"

@Service()
class ChestDefaultScene extends AbstractScene
{
    public animationObjects: THREE.Mesh[] = new Array<THREE.Mesh>()

    private static OBJECT_NAME: string = "Chest_bottom"
    private _animations?: THREE.AnimationClip[]

    private scene: THREE.Scene = new THREE.Scene()
    private _chest?: THREE.Mesh

    constructor(private camera: THREE.Camera, private bus: EventBus)
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

        this.setupAnimations(chest).catch(err => err)
        this.setupModel(chest).catch(err => err)
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

        endPosition.y -= 260

        return new ScaleMove(chest, endPosition)
    }

    public async setupModel(chest: THREE.Mesh): Promise<this>
    {
        chest.rotation.set(1.570796452990513, 0.00008229030048029614, -0.03369080828790532)
        chest.position.set(-5.15701150894165, 63.12309646606445, -5.663540840148926)
        chest.scale.set(.5, .5, .5)

        this.scene.add(chest)

        return this
    }

    private async setupAnimations(chest: THREE.Mesh): Promise<void>
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

    public async loadModel({ models, animations }: {
        models: THREE.Object3D[] | THREE.Mesh[],
        animations: THREE.AnimationClip[]
    }): Promise<void> {
        const [model] = <THREE.Mesh[]>models

        model.children[1].visible = false

        this._chest = model
        this._animations = animations

        const chest = model.clone()

        await this.setupAnimations(chest)
        await this.setupModel(chest)

        super.sendLoadedSceneEvent(this.bus)
    }
}

export default ChestDefaultScene