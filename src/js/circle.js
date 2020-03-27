import paper, { Path, Point } from "paper"

export default class Circle {
    constructor(elementId, opacity = null) {
        paper.setup(elementId)

        this.view = paper.view
        this.center = this.view.center
        this.opacity = opacity ?? .5
        this.circleOptions = {
            strokeWidth: 100, // it is default options, do not touch it
            radius: 100,
        }
        this.insideArc = { radius: 45 }
        this.colorFill = 'black'

        this.calculateCircleOptions()
        this.setup()

        this.circle = new Path.Circle(this.center, this.circleOptions.radius)
    }

    setup() {
        paper.view.onResize = _ => {
            this
                .calculateCircleOptions()
                .draw()
        }
    }

    calculateCircleOptions()
    {
        let sumOfClient = Math.floor((this.view.element.clientWidth * this.view.element.clientHeight) / 10000);
        let radius = sumOfClient + sumOfClient / 100 * 20;

        if (radius > 200) {
            radius /= 1.3
        }

        this.insideArc.radius = radius / 2.3
        this.circleOptions.radius = radius
        this.circleOptions.strokeWidth = radius

        return this
    }

    draw() {
        this.drawCenterHalfFillCircle()
        this.drawCircle()

        return this
    }

    drawCircle() {
        this.circle.radius = this.circleOptions.radius
        this.circle.position = this.center
        this.circle.opacity = this.opacity
        this.circle.style = {
            strokeColor: this.colorFill,
            strokeWidth: this.circleOptions.strokeWidth,
        }
    }

    drawCenterHalfFillCircle() {
        if ('undefined' !== typeof this.arc)
            return

        this.arc = new Path.Arc({
            through: [0, this.insideArc.radius],
            from: [-this.insideArc.radius, 0],
            to: [this.insideArc.radius, 0],
        })

        this.arc.style = {
            fillColor: this.colorFill,
            strokeWidth: 0,
        }
        this.arc.opacity = this.opacity + .01
        this.arc.position = [
            this.center.x,
            this.center.y + this.insideArc.radius / 2,
        ]
    }
}