import PhysicalScene from "../module/scene/PhysicalScene"
import Physijs from "physijs-webpack"
import {
    BoxGeometry,
    Camera,
    DirectionalLight, Geometry, Material,
    MeshLambertMaterial,
    Vector3
} from "three"

class ChestPhysicalScene implements PhysicalScene
{
    private scene: Physijs.Scene
    private camera: Camera
    private ground: Physijs.BoxMesh

    constructor(camera: Camera)
    {
        this.scene = new Physijs.Scene()
        this.camera = camera

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
            material = Physijs.createMaterial(threeMaterial, 1, 1),
            geometry = new BoxGeometry(500, 1, 500)

        this.ground = new Physijs.BoxMesh(geometry, material, 0)
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

    public setupCamera(camera: Camera): this
    {
        camera.position.set(600, 150, -250)
        camera.lookAt(this.scene.position)

        return this
    }

    private setupLight(camera: Camera): this
    {
        const
            light = new DirectionalLight(0xffffff, 0.5)

        light.position.set(50, 200, 0)

        camera.add(light)

        return this
    }

    private createPhysicalMesh(obj, friction: number = 0, restitution: number = 0, mass: number = undefined): Physijs.ConvexMesh
    {
        let
            geometry: Geometry = new Geometry().fromBufferGeometry(obj.geometry),
            material: Material = Physijs.createMaterial(obj.material, friction, restitution)

        return new Physijs.ConvexMesh(geometry, material, mass)
    }
}

export default ChestPhysicalScene