/* eslint-disable */
import * as THREE from "three"

class ScaleMove
{
    private onCompleteCallback: (object: THREE.Object3D) => any
    private requestId?: number

    constructor(private object: THREE.Object3D, private endPosition: THREE.Vector3) {
        this.onCompleteCallback = (object: THREE.Object3D) => object
    }

    public onComplete(callback: (object?: THREE.Object3D) => any): this
    {
        this.onCompleteCallback = callback

        return this
    }

    public animate(): void
    {
        this.requestId = requestAnimationFrame(() => this.animate())

        this.object.position.y -= 3
        this.object.position.z += .1

        if (this.object.position.distanceTo(this.endPosition) <= 10) {
            cancelAnimationFrame(this.requestId)

            this.object.position.y += 3

            setTimeout(() => this.onCompleteCallback(this.object), 0)

            return
        }

        this.object.scale.x += .0035
        this.object.scale.y += .0035
        this.object.scale.z += .0035
    }
}

export default ScaleMove