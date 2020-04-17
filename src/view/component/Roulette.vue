<template>
    <div class="container animated" :class="{ fadeIn: showRoulette }" :style="
        showRoulette ? 'z-index: 1;' : 'z-index: -1;'
    ">
        <div class="zoom-loupe roulette-wrapper">
            <div class="cursor"></div>
            <div class="roulette" id="zoom-loupe">
                <ul class="roulette__list">
                    <li class="roulette__prize" :data-key="item" v-for="item in items(35)" :key="item" >
                        <div class="prize-item">
                            <div class="prize-item__overlay"></div>
                            <span>{{ item }}</span>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
        <div class="bg-roulette roulette-wrapper">
            <div class="roulette" id="bg-roulette">
                <ul class="roulette__list">
                    <li class="roulette__prize" :data-key="item" v-for="item in items(35)" :key="item" >
                        <div class="prize-item">
                            <div class="prize-item__overlay"></div>
                            <span>{{ item }}</span>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import ListManager from "@/component/Roulette/ListManager"
    import { Component, Vue } from "vue-property-decorator"
    import Roulette from "@/component/Roulette/Roulette"
    import axios from "axios"
    import { EventBus } from "ts-bus"
    import { EventName } from "@/event"
    import { BusEvent } from "ts-bus/types"
    import { Inject } from "vue-di-container"

    @Component
    export default class extends Vue
    {
        private showRoulette!: boolean
        private _roulette?: Roulette

        @Inject(EventBus) private bus!: EventBus

        data(): object {
            return {
                showRoulette: false,
            }
        }

        public async mounted(): Promise<void>
        {
            const audio: HTMLAudioElement = await this.loadAudio("/audio/click.wav")

            const listManager = new ListManager('#zoom-loupe > ul', '#bg-roulette > ul')

            this._roulette = new Roulette(listManager, {
                acceleration: 400,
                spacing: 5,
                duration: 1400,
                audio: audio,
                bus: this.bus,
            })

            this.bus.subscribe(EventName.CHEST_OPENED, (e: BusEvent) => this.play())
            this.bus.subscribe(EventName.ROULETTE_STOPPED, (e: BusEvent) => this.stop())
        }

        public get roulette(): Roulette
        {
            if (undefined === this._roulette) {
                throw "Roulette was not initialized"
            }

            return this._roulette
        }

        public play(): void
        {
            this.showRoulette = true
            this.roulette.rotateTo(1, { time: 1, random: true })
        }

        public stop(): void
        {
            this.showRoulette = false
        }

        public* items(count: number = 10): Generator<number>
        {
            for (let i = 1; i <= count; i++) {
                yield i
            }
        }

        private async loadAudio(path): Promise<HTMLAudioElement>
        {
            return new Promise(resolve => {
                axios({
                    url: path,
                    method: "GET",
                    responseType: "blob",
                }).then(
                    resp => resolve(new Audio(URL.createObjectURL(
                        new Blob([resp.data])
                    )))
                )
            })
        }
    }
</script>

<style lang="stylus" scoped>
    $rouletteHeight = 100px
    $itemWidth = 150px

    .container
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position absolute
        height 100%
        width 100%
        opacity 0
        left 0
        top 0
        &:after
            background-image radial-gradient(circle at 50%, transparent 15%, rgba(0,0,0,.2), rgba(0,0,0,.7))
            position absolute
            height 100%
            width 100%
            content ''
            top 0
            left 0

    .roulette-wrapper
        align-items center
        position absolute
        display flex
        height 100%
        width 100%
        top 0
        left 0

    .zoom-loupe
        clip-path circle(15% at 50% 50%)
        background rgba(0,0,0,.1)
        transform scale(1.2)
        z-index: 1
        display flex
        height 100%
        width 100%
        top 0
        left 0

    .bg-roulette
        filter blur(5px)

        &:before
            background-image url($backgroundImage)
            clip-path circle(18% at 50% 50%)
            background-repeat no-repeat
            background-position center
            background-size cover
            position absolute
            height 100%
            width 100%
            content ''
            top 0
            left 0
        &:after
            background-image url($chestImage)
            clip-path circle(25% at 50% 50%)
            transform translate(0, -50%)
            filter blur(8px)
            background-repeat no-repeat
            background-position center
            background-size contain
            position absolute
            height 60vh
            width 100%
            content ''
            top 50%
            left 0
        .roulette
            z-index -1
            opacity .6


    .cursor
        height $rouletteHeight
        position absolute
        width 100%
        content ''
        &:before {
            display: block
            position absolute
            content ''
            width 3px
            height 100%
            background #fffd73
            left 50%
            opacity 0.8
            z-index: 2;
        }

    .roulette
        height $rouletteHeight
        pointer-events none
        position relative
        display flex

        &__list
            position relative
            list-style none
            display flex

        .prize-item
            width $itemWidth
            height $rouletteHeight
            position relative
            background-color rgba(0, 0, 0, .1)
            border 1px solid rgba(0, 0, 0, .1)
            border-bottom 5px solid #8218e7
            font-size 5em
            color #ffffff

            &__overlay
                &:before {
                    content: ""
                    bottom 0
                    left 0
                    opacity 1
                    z-index 1
                    width 100%
                    height 100%
                    position absolute
                    background-image linear-gradient(to top, #8218e7, #51208000, #ffffff00, #ffffff00, #ffffff00)
                }
</style>