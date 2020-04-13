<template>
    <div class="roulette-wrapper">
        <div class="cursor"></div>
        <div id="container"></div>
        <!--        <div class="roulette">-->
        <!--            <div v-for="item in items()" :key="item" class="prize-item">-->
        <!--                <div class="prize-item__overlay"></div>-->
        <!--                <span>{{ item }}</span>-->
        <!--            </div>-->
        <!--        </div>-->
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Konva from "konva"

    @Component
    export default class Roulette extends Vue
    {
        private boxes: Array<Konva.Group> = new Array<Konva.Group>()
        private roulette?: Roulette

        private boxWidth: number = 150
        private boxHeight: number = 100
        private space: number = 5

        mounted(): void
        {
            const stage = new Konva.Stage({
                container: "container",
                width: window.innerWidth,
                height: window.innerHeight
            })

            const baseLayer = new Konva.Layer({
                blurRadius: 20,
                imageSmoothingEnabled: true
            })
            const zoomLayer = new Konva.Layer()

            stage.add(baseLayer)
            stage.add(zoomLayer)

            this.addItemsToLayers(baseLayer, zoomLayer)
            this.addZoomLens(zoomLayer)

            const velocity = 1500, stageWidth = stage.width()

            let prev = this.lastBlock()

            const anim = new Konva.Animation(frame => {
                if (undefined === frame)
                    return

                for (let box of this.boxes){

                    if (box.x() <= -this.boxWidth) {
                        box.x(prev.x() + this.boxWidth + 10)

                        prev = box
                    }

                    box.x(box.x() - velocity * (frame.timeDiff / 1000))
                }

                // if (this.lastBlock().x() < 150) {
                //     anim.stop()
                // }
            }, baseLayer)

            anim.start()

            baseLayer.draw()
        }

        private firstBlock(): Konva.Group
        {
            return this.boxes[0]
        }

        private lastBlock(): Konva.Group
        {
            return this.boxes[this.boxes.length - 1]
        }

        private widthAllBoxes(): number
        {
            return this.boxes.length * (this.boxWidth)
        }

        private addZoomLens(layer: Konva.Layer): void
        {
            let circle = new Konva.Circle({
                radius: 180,
                fill: 'rgba(0,0,0,.2)',
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
            })

            layer.add(circle)
        }

        private addItemsToLayers(baseLayer: Konva.Layer, zoomLayer: Konva.Layer): void
        {
            let x, y = window.innerHeight / 2 - (this.boxHeight / 2)

            for (let item of this.items(30)) {
                x = 0 === item ? 0 : item * this.boxWidth

                let group = new Konva.Group({
                    x: x, y: y
                })

                let box: Konva.Rect = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: this.boxWidth,
                    height: this.boxHeight,
                    strokeWidth: 1,
                    stroke: '#000',
                })

                let text: Konva.Text = new Konva.Text({
                    x: 0, y: 0,
                    text: item.toString(),
                    fontSize: 80,
                    fontFamily: 'Calibri',
                    fill: '#fff',
                    width: this.boxWidth,
                    height: this.boxHeight,
                    padding: 10,
                    align: 'center'
                })

                box.fillLinearGradientStartPointY(this.boxHeight - 5)
                box.fillLinearGradientColorStops(
                    new Array<number|string>(0, '#8218e766', .5, '#00000000')
                )

                group.add(box, text)

                this.boxes.push(group)

                let zoomBox: Konva.Rect = box.clone()

                baseLayer.add(group)
                zoomLayer.add(zoomBox)
            }
        }


        public * items(count: number = 10): Generator<number>
        {
            for (let i = 0; i <= count; i++) {
                yield i
            }
        }
    }
</script>

<style lang="stylus">
    $rouletteHeight = 100px
    $itemWidth = 150px

    .roulette-wrapper
        position absolute
        align-items center
        display flex
        height 100%
        width 100%
        top 0
        left 0

    .cursor
        height $rouletteHeight
        width 100%
        content ''
        position absolute

        &:before
            display: block
            position absolute
            content ''
            width 6px
            height 100%
            background #f8f409
            left 50%
            opacity 0.8
            z-index: 2;

    .roulette
        position relative
        display flex
        height $rouletteHeight
        width auto
        pointer-events none

        &__list
            position relative
            list-style none
            display flex

        &__prize
            height 100%

        .prize-item
            width $itemWidth
            height $rouletteHeight
            position relative
            background-color rgba(0, 0, 0, .1)
            border 1px solid rgba(0, 0, 0, .1)
            border-bottom 5px solid #8218e7
            font-size 5em
            color #ffffff

            span
                z-index -1

            &__overlay
                z-index 1

                &:before
                    content: ""
                    bottom 0
                    left 0
                    opacity 1
                    z-index 1
                    width 100%
                    height 100%
                    position absolute
                    background-image linear-gradient(to top, #8218e7, #d7adff, #ffffff, #ffffff, #ffffff)
                    mix-blend-mode color
                    pointer-events none


    #app
        @extend .noselect
</style>