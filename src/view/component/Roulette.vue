<template>
    <div class="roulette-wrapper">
        <div class="roulette">
            <div v-for="item in items()" :key="item" class="prize-item">{{ item }}</div>
        </div>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Roulette from "@/component/Roulette/Roulette"

    @Component
    export default class CenterCircle extends Vue
    {
        private roulette?: Roulette

        * items(): Generator<number>
        {
            for (let i = 0; i <= 40; i++) {
                yield i
            }
        }

        mounted(): void
        {
            this.roulette = new Roulette(".roulette", {
                acceleration: 350,
                spacing: 10,
                fps: 60,
            })
        }
    }
</script>

<style lang="stylus">
    .roulette-wrapper
        align-items center
        display flex
        height 100%

    .roulette
        position absolute
        display flex
        height 200px
        width 100%

        &__list
            position relative
            list-style none
            max-height 200px
            display flex

        &:before
            display: block
            position absolute
            content ''
            width 6px
            height 100%
            background #f8f409
            left 50%
            opacity 0.8
            z-index 1

        .prize-item
            height 200px
            width 200px
            background #2dffd2
            border-bottom 5px solid #8218e7
            font-size 10em
            color #fff
</style>