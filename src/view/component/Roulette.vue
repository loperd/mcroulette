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

<style lang="stylus" scoped>
    .roulette-wrapper
        position relative
        height: 100%
        left 0
        top 0

    .roulette
        height 100%


        .prize-item
            background #fff
</style>