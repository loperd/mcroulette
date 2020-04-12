import * as paper from "paper"

class Circle
{
    private readonly colorFill: paper.Color
    private center: paper.Point

    private insideArc: { radius: number } = { radius: 45 }
    private circle: paper.Path.Circle
    private arc?: paper.Path.Arc
    private view: paper.View
    private circleOptions: {
        strokeWidth: number
        radius: number
    } = {
        strokeWidth: 0,
        radius: 0
    }

    constructor(elementId, private readonly opacity: number = .5)
    {
        paper.setup(elementId)
        this.view = paper.view

        this.center = this.view.center

        this.calculate()
        this.setup()

        this.colorFill = new paper.Color(0, 0, 0, this.opacity)
        this.circle = new paper.Path.Circle(this.center, this.circleOptions.radius)
    }

    public setup(): void
    {
        this.view.onResize = _ => {
            this.view = paper.view
            this.center = this.view.center
            this.calculate().draw()
        }
    }

    public calculate()
    {
        let sumOfClient = Math.floor(this.view.element.offsetWidth + this.view.element.offsetHeight) / 10
        let radius = (sumOfClient / 100) * 60

        this.insideArc.radius = radius * .43
        this.circleOptions.radius = radius
        this.circleOptions.strokeWidth = radius

        return this
    }

    public draw(): void
    {
        this
            .drawCenterHalfFillCircle()
            .drawCircle()
    }

    public drawCircle(): void
    {
        this.circle.position = this.center
        this.circle.style = new paper.Style({
            strokeColor: this.colorFill,
            strokeWidth: this.circleOptions.strokeWidth,
        })
    }

    public drawCenterHalfFillCircle(): this
    {
        if (undefined === this.arc) {
            this.arc = new paper.Path.Arc({
                through: [0, this.insideArc.radius],
                from: [-this.insideArc.radius, 0],
                to: [this.insideArc.radius, 0],
            })
        }

        this.arc.style = new paper.Style({
            fillColor: this.colorFill,
            strokeWidth: 0,
        })

        this.arc.position = new paper.Point([
            this.center.x,
            this.center.y + this.insideArc.radius / 2,
        ])

        return this
    }
}

export default Circle