import PhysicalScene from "../../model/Scene/PhysicalScene"
import { Scene, createMaterial, BoxMesh, ConvexMesh } from "physijs-webpack"
import Helper from "../../model/helper"
import {
    AnimationClip,
    BoxGeometry,
    Camera,
    DirectionalLight,
    Geometry,
    Mesh,
    MeshLambertMaterial,
    MeshStandardMaterial,
    Object3D,
    Vector3,
} from "three"

class ChestPhysicalScene implements PhysicalScene
{
    private ground: BoxMesh
    private chest: ConvexMesh
    private scene: Scene = new Scene()

    constructor(private camera: Camera) {
        this.setupGround()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupLight(camera)

        this.scene.simulate()
    }

    public setupGround(): this
    {
        let threeMaterial = new MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        })

        const
            material = createMaterial(threeMaterial, 1, 1),
            geometry = new BoxGeometry(500, 1, 500)

        this.ground = new BoxMesh(geometry, material, 0)
        this.ground.position.y += 50

        this.scene.add(this.ground)

        return this
    }

    public setupScene(camera: Camera): this
    {
        this.scene.setGravity(new Vector3(10, -700, 10))
        this.scene.add(camera)
        this.scene.addEventListener(
            "update", _ => this.scene.simulate(undefined, 1)
        )

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

    public setupModel({ model, animations }: { animations: Array<AnimationClip>, model: Mesh }): this {
        this.chest = this.convertToPhysicalMesh(model, 1, .2)

        this.setupChestRoof(this.chest.children[0])

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
        const
            light = new DirectionalLight(0xffffff, 0.5)

        light.position.set(50, 200, 0)

        camera.add(light)

        return this
    }

    private convertToPhysicalMesh(obj, friction: number = 0, restitution: number = 0, mass: number = undefined): ConvexMesh
    {
        let
            geometry: Geometry = new Geometry().fromBufferGeometry(obj.geometry),
            material: MeshStandardMaterial = createMaterial(obj.material, friction, restitution)

        return new ConvexMesh(geometry, material, mass)
    }

    loadModel(loadedObjects: Array<Object3D>): this
    {
        return this;
    }
}

export default ChestPhysicalScene