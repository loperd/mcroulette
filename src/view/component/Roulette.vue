<template>
    <div class="roulette-wrapper">
        <div class="cursor"></div>
        <div class="roulette">
            <div v-for="item in items(35)" :key="item" style="width: 150px" class="prize-item">
                <div class="prize-item__overlay"></div>
                <span>{{ item }}</span>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Roulett from '@/component/Roulette/Roulette'

    @Component
    export default class Roulette extends Vue
    {
        private roulette?: Roulett

        mounted(): void
        {
            this.roulette = new Roulett(".roulette", {
                acceleration: 500,
                spacing: 0,
                fps: 30,
            })

            this.roulette.rotateTo(1, { time: 2, random: true });
        }

        public * items(count: number = 10): Generator<number>
        {
            for (let i = 1; i <= count; i++) {
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
        clip-path circle(15% at 50% 50%)
        background rgba(255,255,255, .1)
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

        &:before {
            display: block
            position absolute
            content ''
            width 6px
            height 100%
            background #f8f409
            left 50%
            opacity 0.8
            z-index: 2;
        }

    .roulette
        position relative
        display flex
        height $rouletteHeight
        pointer-events none
        z-index -1

        &__list
            position relative
            list-style none
            display flex

        &__prize
            height 100%
            width $itemWidth

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
                    background-image linear-gradient(to top, #8218e7, #51208000, #ffffff00, #ffffff00, #ffffff00)


    #app
        @extend .noselect
</style>