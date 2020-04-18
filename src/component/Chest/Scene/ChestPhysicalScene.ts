import AbstractScene from "./AbstractScene"
import * as Physijs from "physijs"
import { EventBus } from "ts-bus"
import * as THREE from "three"
import { d } from "@/helper"
import { SCENE_LOADED_EVENT } from "@/event"

class ChestPhysicalScene extends AbstractScene
{
    private scene: Physijs.Scene
    private ground?: Physijs.BoxMesh
    private _chest?: Physijs.ConvexMesh

    constructor(private camera: THREE.Camera, private bus: EventBus)
    {
        super()
        this.scene = new Physijs.Scene()
        this.setupScene(camera)
        this.setupCamera(camera)
        this.setupGround()

        this.setupLight(camera)
    }

    public play(): void
    {
        this.scene.simulate(undefined, 1)
    }

    get chest(): Physijs.ConvexMesh
    {
        if (undefined === this._chest) {
            throw new Error('Chest was not setup.')
        }

        return this._chest
    }

    public getScene(): Physijs.Scene
    {
        return this.scene
    }

    public reset(): void
    {
        this.constructor(this.camera)

        this.setupModel(this.chest.clone())
    }

    public createGround(x: number, y: number, z: number): Physijs.BoxMesh
    {
        const baseMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            opacity: 0,
            transparent: true,
        })

        const material = Physijs.createMaterial(baseMaterial, 1, 1)

        return new Physijs.BoxMesh(new THREE.BoxGeometry(x, y, z), material, 0)
    }

    public setupGround(): this
    {
        if (this.ground === undefined) {
            this.ground = this.createGround(500, 1, 500)
            this.ground.position.y += 62
        }

        this.scene.add(this.ground)

        return this
    }

    public setupScene(camera: THREE.Camera): this
    {
        this.scene.setGravity(new THREE.Vector3(10, -800, 10))
        this.scene.addEventListener("update", () => this.scene.simulate(undefined, 1))
        this.scene.add(camera)

        return this
    }

    public setupModel(chest: Physijs.ConvexMesh): this
    {
        chest.position.set(0, 312, 0)
        chest.rotation.set(d(90), d(0), d(0))

        chest.rotation.x += d(5)
        chest.rotation.y += d(0)
        chest.rotation.z += d(0)

        chest.scale.set(.5, .5, .5)

        const [roof] = chest.children

        roof.position.set(-119.91560363769531, 0.000023036218408378772, -159.01849365234375)
        roof.rotation.set(0, 0, 0)
        roof.parent = chest

        this.scene.add(chest)

        return this
    }

    private convertToPhysicalMesh(
        { obj, friction = 0, restitution = 0, mass = undefined }: {
            obj: THREE.Mesh,
            friction?: number,
            restitution?: number,
            mass?: number
        }
    ): Physijs.ConvexMesh {

        let
            geometry: THREE.Geometry = new THREE.Geometry().fromBufferGeometry(<THREE.BufferGeometry>obj.geometry),
            material: Physijs.Material = Physijs.createMaterial(<THREE.Material>obj.material, friction, restitution)

        const result = new Physijs.ConvexMesh(geometry, material, mass)

        result.name = obj.name

        if (obj.children.length === 0) {
            return result
        }

        ([...obj.children]).forEach((value: THREE.Object3D | THREE.Mesh): any =>
        {
            if (value === undefined)
                return value

            if (!(<THREE.Mesh>value).isMesh)
                return value

            result.add(<THREE.Object3D>this.convertToPhysicalMesh({ obj: <THREE.Mesh>value }))
        })

        return result
    }

    public async loadModel({ models }: { models: THREE.Object3D[] | THREE.Mesh[] }): Promise<void>
    {
        let [model] = <THREE.Mesh[]>models

        this._chest = this.convertToPhysicalMesh({ obj: model, friction: 1, restitution: .3 })

        this.chest.children.splice(1, 1)

        await this.setupModel(this.chest.clone())

        super.sendLoadedSceneEvent(this.bus)
    }
}

export default ChestPhysicalScene