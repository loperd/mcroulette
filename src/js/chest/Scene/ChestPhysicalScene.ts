import PhysicalScene from "../../model/Scene/PhysicalScene"
import { BoxMesh, ConvexMesh, createMaterial, Scene } from "physijs-webpack"
import Helper from "../../model/helper"
import * as THREE from "three"
import {
    AnimationClip,
    BoxGeometry,
    BufferGeometry,
    Camera,
    DirectionalLight,
    Geometry,
    Mesh,
    MeshLambertMaterial,
    MeshStandardMaterial,
    Object3D
} from "three"

class ChestPhysicalScene implements PhysicalScene
{
    private readonly scene: Scene = new Scene()
    private chest: ConvexMesh
    private ground: BoxMesh

    constructor(private camera: Camera)
    {
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupGround()

        this.setupLight(camera)
    }

    public getScene(): Scene
    {
        return this.scene
    }

    public setupGround(): this
    {
        const baseMaterial = new MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        })

        const material = createMaterial(baseMaterial, 1, 1)

        this.ground = new BoxMesh(new BoxGeometry(500, 1, 500), material, 0)
        this.ground.position.y += 0

        this.scene.add(this.ground)

        return this
    }

    public setupScene(camera: Camera): this
    {
        this.scene.simulate(undefined, 1)
        this.scene.setGravity(new THREE.Vector3(10, -700, 10))
        this.scene.addEventListener("update", _ => this.scene.simulate(undefined, 1))
        this.scene.add(camera)

        return this
    }

    private setupChestRoof(chestRoof: Mesh)
    {
        const roof = this.convertToPhysicalMesh(chestRoof)

        roof.position.set(-119.91560363769531, 0.000023036218408378772, -159.01849365234375)
        roof.rotation.set(0, 0, 0)
        roof.parent = this.chest

        this.chest.add(roof)
    }

    public setupModel(model: Mesh): this
    {
        this.chest = this.convertToPhysicalMesh(model, 1, .2)

        this.setupChestRoof(<Mesh>model.children[0])

        this.chest.position.set(0, 400, 0)
        this.chest.rotation.set(Helper.d(90), Helper.d(0), Helper.d(0))

        this.chest.rotation.x += Helper.d(5)
        this.chest.rotation.y += Helper.d(0)
        this.chest.rotation.z += Helper.d(0)

        this.chest.scale.set(.4, .4, .4)
        this.scene.add(this.chest)

        return this
    }

    public setupCamera(camera: Camera): this
    {
        camera.position.set(600, 150, -250)
        camera.lookAt(this.scene.position)

        return this
    }

    public setupLight(camera: Camera): this
    {
        const dirLight = new DirectionalLight(0xffffff, 1)
        const ambientLight = new THREE.AmbientLight( 0x404040 ); // soft white light

        dirLight.position.set(20, 50, 0)

        camera.add(dirLight)

        this.scene.add(dirLight)
        this.scene.add(ambientLight);

        return this
    }

    private convertToPhysicalMesh(obj: Mesh, friction: number = 0, restitution: number = 0, mass: number = undefined): ConvexMesh
    {
        let
            geometry: Geometry = new Geometry().fromBufferGeometry(<BufferGeometry>obj.geometry),
            material: MeshStandardMaterial = createMaterial(obj.material, friction, restitution)

        return new ConvexMesh(geometry, material, mass)
    }

    public loadModel({ models }: { models: Object3D[] | Mesh[] }): void
    {
        const [model] = <Mesh[]>models

        this.setupModel(model)
    }
}

export default ChestPhysicalScene