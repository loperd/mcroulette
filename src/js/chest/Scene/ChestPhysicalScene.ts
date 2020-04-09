import AbstractScene from "./AbstractScene"
import { d } from "../../model/helper"
import * as Physijs from "physijs-webpack"
import * as THREE from "three"

class ChestPhysicalScene extends AbstractScene
{
    private scene: Physijs.Scene
    private chest: Physijs.ConvexMesh
    private ground: Physijs.BoxMesh

    constructor(private camera: THREE.Camera)
    {
        super()
        this.scene = new Physijs.Scene()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupGround()

        this.setupLight(camera)
    }

    public play = (): void => this.scene.simulate(undefined, 1)

    public getScene(): Physijs.Scene
    {
        return this.scene
    }

    public reset(): void
    {
        this.constructor(this.camera)

        this.setupModel(this.chest.clone())
    }

    public setupGround(): this
    {
        if (this.ground !== undefined) {
            this.scene.add(this.ground)
        }

        const baseMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        })

        const material = Physijs.createMaterial(baseMaterial, 1, 1)

        this.ground = new Physijs.BoxMesh(new THREE.BoxGeometry(500, 1, 500), material, 0)

        this.scene.add(this.ground)

        return this
    }

    public setupScene(camera: THREE.Camera): this
    {
        this.scene.setGravity(new THREE.Vector3(10, -700, 10))
        this.scene.addEventListener("update", _ => this.scene.simulate(undefined, 1))
        this.scene.add(camera)

        return this
    }

    public setupModel(chest: Physijs.ConvexMesh): this
    {
        chest.position.set(0, 400, 0)
        chest.rotation.set(d(90), d(0), d(0))

        chest.rotation.x += d(5)
        chest.rotation.y += d(0)
        chest.rotation.z += d(0)

        chest.scale.set(.4, .4, .4)

        const [roof] = chest.children

        roof.position.set(-119.91560363769531, 0.000023036218408378772, -159.01849365234375)
        roof.rotation.set(0, 0, 0)
        roof.parent = chest

        this.scene.add(chest)

        return this
    }

    private convertToPhysicalMesh(
        obj: THREE.Mesh,
        friction: number = 0,
        restitution: number = 0,
        mass: number = undefined
    ): Physijs.ConvexMesh {

        let
            geometry: THREE.Geometry = new THREE.Geometry().fromBufferGeometry(<THREE.BufferGeometry>obj.geometry),
            material: THREE.MeshStandardMaterial = Physijs.createMaterial(obj.material, friction, restitution)

        const result = new Physijs.ConvexMesh(geometry, material, mass)

        result.name = obj.name

        if (obj.children.length === 0) {
            return result
        }

        ([...obj.children]).forEach((value: THREE.Object3D | THREE.Mesh): THREE.Object3D | Physijs.ConvexMesh =>
        {
            if (value === undefined)
                return

            if (!(<THREE.Mesh>value).isMesh && value instanceof THREE.Object3D)
                return value

            result.add(<THREE.Object3D>this.convertToPhysicalMesh(<THREE.Mesh>value))
        })

        return result
    }

    public loadModel({ models }: { models: THREE.Object3D[] | THREE.Mesh[] }): void
    {
        let [model] = <THREE.Mesh[]>models

        this.chest = this.convertToPhysicalMesh(model, 1, .2)

        this.chest.children.splice(1, 1)

        this.setupModel(this.chest.clone())
    }
}

export default ChestPhysicalScene