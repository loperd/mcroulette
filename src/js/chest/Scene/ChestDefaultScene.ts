import {
    AnimationClip,
    AnimationMixer,
    Camera,
    Clock,
    DirectionalLight,
    LoopOnce,
    Mesh,
    Object3D,
    Scene,
    Vector3, VectorKeyframeTrack,
} from "three"
import DefaultScene from "../../model/Scene/DefaultScene"
import * as THREE from "three"
import AbstractScene from "./AbstractScene"

class ChestDefaultScene extends AbstractScene implements DefaultScene
{
    private animations: Mesh[] = new Array<Mesh>()
    private readonly scene: Scene = new Scene()
    private chestRoof: Mesh
    private chestKey: Mesh
    private chest?: Mesh

    constructor(private camera: Camera)
    {
        super()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupLight(camera)
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

    public get animationObjects(): Mesh[]
    {
        return this.animations
    }

    public addAnimation(animObject: Mesh): this
    {
        this.animations.push(animObject)
        return this
    }

    public setupModel(model: Mesh): this
    {
        const [chestRoof, chestKey] = <Mesh[]>model.children

        this.chestRoof = chestRoof
        this.chestKey = chestKey
        this.chest = model

        this.chest.position.set(-3.80780029296875, 1.1276047229766846, -6.184289932250977)
        this.chest.rotation.set(1.5708281206194878, -0.0000031430918714433056, -0.06824258068266337)
        this.chest.scale.set(.4, .4, .4)

        this.chestKey.visible = false

        this.scene.add(this.chest)
        return this
    }

    private setupAnimations(animations: AnimationClip[], model: Mesh): void
    {
        model = this.chest || model

        const [chestRoof, chestKey] = <Mesh[]>model.children
        const [chestRoofClip, chestKeyClip] = <AnimationClip[]>animations

        chestRoof.userData.mixer = new AnimationMixer(chestRoof)
        chestKey.userData.mixer = new AnimationMixer(chestKey)
        // model.userData.mixer = new AnimationMixer(model)

        chestRoof.userData.animation = chestRoofClip
        chestKey.userData.animation = chestKeyClip
        // model.userData.animation = chestClip

        this.animations.push(chestRoof, chestKey)
    }

    public createMoveAnimation(mesh: Mesh, endPosition: Vector3): AnimationClip
    {
        mesh.userData.mixer = new AnimationMixer(mesh)
        const { position: startPosition } = mesh

        const tracks: Array<VectorKeyframeTrack> = new Array<VectorKeyframeTrack>();

        tracks.push(new VectorKeyframeTrack(
            ".position", [0, 1, 2],
            [
                startPosition.x,
                startPosition.y,
                startPosition.z,
                endPosition.x,
                endPosition.y,
                endPosition.z,
            ]
        ))

        return new AnimationClip('move', 10, tracks)
    }

    public loadModel({ models, animations }: { models: Object3D[] | Mesh[], animations: AnimationClip[] }): void
    {
        const [model] = <Mesh[]>models

        this.setupModel(model)
        this.setupAnimations(animations, model)
    }
}

export default ChestDefaultScene