<template>
    <div class="container"></div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Konva from 'konva'

    @Component
    export default class extends Vue
    {
        public name: string = 'CircleCenter'

        private fillColor: string = 'black'
        private opacity: Number = .17

        private circle!: Konva.Circle
        private stage!: Konva.Stage
        private layer!: Konva.Layer
        private arc!: Konva.Arc

        mounted(): void
        {
            this.layer = new Konva.Layer()
            this.stage = new Konva.Stage({
                container: ".container",
                width: window.innerWidth,
                height: window.innerHeight,
            })

            this.circle = new Konva.Circle({
                y: this.stage.height() / 2,
                x: this.stage.width() / 2,
                stroke: this.fillColor,
                opacity: this.opacity,
                strokeWidth: 0,
                radius: 0
            })

            this.arc = new Konva.Arc({
                y: this.stage.height() / 2,
                x: this.stage.width() / 2,
                opacity: this.opacity,
                fill: this.fillColor,
                outerRadius: 0,
                innerRadius: 0,
                angle: 180,
            });

            this.drawCircle()
            this.drawArc()

            this.layer.add(this.arc)
            this.layer.add(this.circle)
            this.stage.add(this.layer)

            window.addEventListener('resize', () => this.resize())
        }

        resize(): void
        {
            this.stage.width(window.innerWidth)
            this.stage.height(window.innerHeight)

            this.circle.x(this.stage.width() / 2)
            this.circle.y(this.stage.height() / 2)

            this.arc.x(this.stage.width() / 2)
            this.arc.y(this.stage.height() / 2)

            this.drawArc()
            this.drawCircle()
        }

        private radius(): number
        {
            const width: number = this.stage.width()

            switch (true) {
                case width < 640:
                    return width / 3
                case width < 768:
                    return width / 4
                case width < 1024:
                    return width / 5
                case width < 1280:
                    return width / 7
            }

            return width / 10
        }

        private drawCircle(): this
        {
            const radius = this.radius()
            this.circle.strokeWidth(radius)
            this.circle.radius(radius)

            return this
        }

        private drawArc(): this
        {
            const radius = this.radius()
            this.arc.outerRadius(radius / 2 - (radius / 100 * 5))

            return this
        }
    }
</script>

<style lang="stylus" scoped>
    .container
        position absolute
        height 100%
        width 100%
        top 0
        left 0
</style>
