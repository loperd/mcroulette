import { Clock, Object3D, Vector3 } from "three"

class ScaleMove
{
    private clock: Clock = new Clock()
    private requestId: number
    private onCompleteCallback: (object: Object3D) => any

    constructor(private object: Object3D, private endPosition: Vector3) {}

    public onComplete(callback: (object?: Object3D) => any): this
    {
        this.onCompleteCallback = callback

        return this
    }

    public animate(): void
    {
        this.requestId = requestAnimationFrame(_ => this.animate())

        this.object.position.y -= 2
        this.object.position.z += .1

        if (this.object.position.distanceTo(this.endPosition) <= 10) {
            cancelAnimationFrame(this.requestId)

            this.object.position.y += 2

            setTimeout(_ => this.onCompleteCallback(this.object), 0)

            return
        }

        this.object.scale.x += .0035
        this.object.scale.y += .0035
        this.object.scale.z += .0035
    }
}

export default ScaleMove