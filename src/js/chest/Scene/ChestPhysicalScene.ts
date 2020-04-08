import { BoxMesh, ConvexMesh, createMaterial, Scene } from "physijs-webpack"
import AbstractScene from "./AbstractScene"
import { d } from "../../model/helper"
import * as THREE from "three"
import {
    BoxGeometry,
    BufferGeometry,
    Camera,
    Geometry,
    Mesh,
    MeshLambertMaterial,
    MeshStandardMaterial,
    Object3D
} from "three"

class ChestPhysicalScene extends AbstractScene
{
    private scene: Scene = new Scene()
    private originalChest: ConvexMesh
    private chest: ConvexMesh
    private roof: ConvexMesh
    private ground: BoxMesh

    constructor(private camera: Camera)
    {
        super()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupGround()

        this.setupLight(camera)
    }

    public play(): void
    {
        this.scene.simulate(undefined, 1)
    }

    public getScene(): Scene
    {
        return this.scene
    }

    public reset(): void
    {
        this.scene = new Scene()

        this.constructor(this.camera)

        this.setupModel(this.chest.clone())
    }

    public setupGround(): this
    {
        if (this.ground !== undefined) {
            this.scene.add(this.ground)
        }

        const baseMaterial = new MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        })

        const material = createMaterial(baseMaterial, 1, 1)

        this.ground = new BoxMesh(new BoxGeometry(500, 1, 500), material, 0)

        this.scene.add(this.ground)

        return this
    }

    public setupScene(camera: Camera): this
    {
        this.scene.setGravity(new THREE.Vector3(10, -700, 10))
        this.scene.addEventListener("update", _ => this.scene.simulate(undefined, 1))
        this.scene.add(camera)

        return this
    }

    public setupModel(chest: ConvexMesh): this
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

    private convertToPhysicalMesh(obj: Mesh, friction: number = 0, restitution: number = 0, mass: number = undefined): ConvexMesh
    {
        let
            geometry: Geometry = new Geometry().fromBufferGeometry(<BufferGeometry>obj.geometry),
            material: MeshStandardMaterial = createMaterial(obj.material, friction, restitution)

        const result = new ConvexMesh(geometry, material, mass)

        result.name = obj.name

        if (obj.children.length === 0) {
            return result
        }

        ([...obj.children]).forEach((value: Object3D | Mesh): Object3D | ConvexMesh =>
        {
            if (value === undefined)
                return

            if (!(<Mesh>value).isMesh && value instanceof Object3D) {
                return value
            }

            result.add(this.convertToPhysicalMesh(<Mesh>value))
        })

        return result
    }

    public loadModel({ models }: { models: Object3D[] | Mesh[] }): void
    {
        let
            [model] = <Mesh[]>models

        this.chest = this.convertToPhysicalMesh(model, 1, .2)

        this.chest.children.splice(1, 1)

        this.setupModel(this.chest.clone())
    }
}

export default ChestPhysicalScene