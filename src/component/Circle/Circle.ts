import Konva from 'konva'

class Circle
{
    private readonly opacity: number = .5

    constructor(elementId: string, opacity?: number)
    {

    }

    public draw(): void
    {
        this
            .drawCenterHalfFillCircle()
            .drawCircle()
    }

    public drawCircle(): void
    {
        // this.circle.position = this.center
        // this.circle.style = new paper.Style({
        //     strokeColor: this.colorFill,
        //     strokeWidth: this.circleOptions.strokeWidth,
        // })
    }

    public drawCenterHalfFillCircle(): this
    {
        // if (undefined === this.arc) {
        //     this.arc = new paper.Path.Arc({
        //         through: [0, this.insideArc.radius],
        //         from: [-this.insideArc.radius, 0],
        //         to: [this.insideArc.radius, 0],
        //     })
        // }
        //
        // this.arc.style = new paper.Style({
        //     fillColor: this.colorFill,
        //     strokeWidth: 0,
        // })
        //
        // this.arc.position = new paper.Point([
        //     this.center.x,
        //     this.center.y + this.insideArc.radius / 2,
        // ])

        return this
    }
}

export default Circle