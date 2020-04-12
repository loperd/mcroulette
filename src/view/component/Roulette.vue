<template>
    <div class="roulette-wrapper">
        <div class="cursor" style="display: none"></div>
        <canvas id="zoomloup" resize></canvas>
        <div class="roulette">
            <div v-for="item in items()" :key="item" class="prize-item">
                <div class="prize-item__overlay"></div>
                <span>{{ item }}</span>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Roulette from "@/component/Roulette/Roulette"
    import * as paper from "paper"

    @Component
    export default class CenterCircle extends Vue
    {
        private roulette?: Roulette

        * items(): Generator<number>
        {
            for (let i = 1; i <= 19; i++) {
                yield i
            }
        }

        mounted(): void
        {
            paper.setup('zoomloup')

            this.roulette = new Roulette(".roulette", {
                acceleration: 400,
                spacing: 10,
                fps: 60,
            })

            const colorfill = new paper.Color(0, 0, 0, .5)

            const circle = new paper.Path.Circle(paper.view.center, 200)

            circle.style = new paper.Style({
                strokeColor: colorfill,
                strokeWidth: 1.5,
                // fillColor: colorfill,
                radius: 100
            })

            circle.scale(1.4, paper.view.center)

            // this.roulette.rotateTo(5, { time: 1, random: true });
        }
    }
</script>

<style lang="stylus">
    $rouletteHeight = 170px
    $itemWidth = 200px

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
            height 170px
            position relative
            background-color rgba(0,0,0,.1)
            border 1px solid rgba(0,0,0,.1)
            border-bottom 5px solid #8218e7
            font-size 8.5em
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

    #zoomloup
        width 100%
        height 100%
        position absolute
        z-index 1
</style>