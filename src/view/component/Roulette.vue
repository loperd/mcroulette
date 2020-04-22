<template>
    <div class="roulette-view" :class="showRoulette ? 'blurIn' : 'blurOut'">
        <div class="roulette-view__zoom-loupe roulette-view__roulette-wrapper">
            <div class="roulette-view__cursor"></div>
            <div class="roulette">
                <div class="prize-item" :data-key="`${item.id}_${i}`" v-for="(item, i) in prizes"
                     :key="Math.random() * item.id" :class="item.type">
                    <div class="prize-item__overlay"
                         :style="`background-image: url(${item.image})`"
                         :class="item.type"
                    ></div>
                </div>
            </div>
        </div>
        <div class="roulette-view__bg-roulette roulette-view__roulette-wrapper">
            <div class="roulette"></div>
        </div>
    </div>
</template>

<script lang="ts">
    import { CHEST_OPEN, CREATE_PRIZES } from "@/store/modules/types"
    import ListManager from "@/component/Roulette/ListManager"
    import { Component, Vue } from "vue-property-decorator"
    import Roulette from "@/component/Roulette/Roulette"
    import { Inject } from "vue-di-container"
    import { Item } from "@/struct/Item"
    import { Getter } from "vuex-class"
    import { EventName } from "@/event"
    import { EventBus } from "ts-bus"
    import axios from "axios"

    @Component
    export default class extends Vue
    {
        @Inject(EventBus) private bus!: EventBus
        @Getter prizeIndex!: number
        @Getter prizes!: Item[]
        @Getter prize!: Item

        private audio?: HTMLAudioElement
        public name: string = "Roulette"
        private _roulette?: Roulette

        private showRoulette: boolean = false

        public async mounted(): Promise<void>
        {
            this.audio = await this.loadAudio("/audio/click.wav")

            await this.$store.dispatch(CREATE_PRIZES)

            this.bus.subscribe(EventName.CHEST_OPEN, () => this.init())
            this.bus.subscribe(EventName.CHEST_OPENED, () => this.play())
            this.bus.subscribe(EventName.ROULETTE_STOPPED, () => this.stop())
        }

        public get roulette(): Roulette
        {
            if (undefined === this._roulette) {
                throw "Roulette was not initialized"
            }

            return this._roulette
        }

        public async init(): Promise<void>
        {
            await this.$store.dispatch(CHEST_OPEN)

            const listManager = new ListManager(".roulette")

            this._roulette = new Roulette(listManager, {
                audio: this.audio,
                bus: this.bus,
                spacing: 5,
                duration: 1200,
                acceleration: 500,
            })
        }

        public play(): void
        {
            this.showRoulette = true

            console.log(this.$store.state.selectedPrizeIndex)

            this.roulette.rotateTo(this.prizeIndex, { time: 5, random: true })
        }

        public stop(): void
        {
            this.showRoulette = false
        }

        private async loadAudio(path): Promise<HTMLAudioElement>
        {
            return new Promise(resolve =>
            {
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
    .roulette-view
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position absolute
        height 100%
        width 100%
        left 0
        top 0

        &:after
            background-image radial-gradient(circle at 50%, transparent 15%, rgba(0, 0, 0, .2), rgba(0, 0, 0, .7))
            position absolute
            height 100%
            width 100%
            content ''
            top 0
            left 0

        &__roulette-wrapper
            align-items center
            position absolute
            display flex
            height 100%
            width 100%
            top 0
            left 0

        &__zoom-loupe
            clip-path circle(15% at 50% 50%)
            background rgba(0, 0, 0, .1)
            transform scale(1.2)
            z-index: 1
            display flex
            height 100%
            width 100%
            top 0
            left 0

        &__bg-roulette
            filter blur(5px)

            &:before
                background-image url($chestImage)
                clip-path circle(18% at 50% 50%)
                transform translate(0, -50%)
                background-repeat no-repeat
                background-position center
                background-size contain
                position absolute
                height 75vh
                width 100%
                content ''
                top 50%
                left 0

            &:after
                background-image url($chestImage)
                background-repeat no-repeat
                transform translate(0, -50%)
                background-position center
                background-size contain
                position absolute
                filter blur(8px)
                z-index -5
                height 75vh
                width 100%
                content ''
                top 50%
                left 0

            .roulette
                z-index -1
                opacity .6

        &__cursor
            height $rouletteHeight
            position absolute
            width 100%
            content ''

            &:before
                display: block
                position absolute
                content ''
                width 3px
                height 100%
                background #fffd73
                left 50%
                opacity 0.8
                z-index: 2;
</style>

<style lang="stylus">
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
            background-color rgba(0, 0, 0, .07)
            font-size 5em
            color #ffffff

            &:after
                position: absolute
                content ''
                height 5px
                z-index 1
                width 100%
                bottom 0
                left 0

            &.default:after
                background-image linear-gradient(90deg, #005bff, #0c5399)

            &.primary:after
                background-image linear-gradient(90deg, #8846c7, #671ab4)

            &.legendary:after
                background-image linear-gradient(90deg, #da3217, #9a1616)

            &__overlay
                background-repeat no-repeat
                background-position center
                background-size contain
                position relative
                padding 0 10px
                height 100%
                width 100%
                content ''

                &:after
                    position absolute
                    content ''
                    bottom 0
                    left 0
                    z-index 1
                    width 100%
                    height 100%

                &.default:after
                    background-image linear-gradient(to top, rgba(0, 91, 255, .5), rgba(5, 49, 95, .5), transparent 40%)

                &.primary:after
                    background-image linear-gradient(to top, rgba(136, 70, 199, .5), rgba(42, 0, 82, .5), transparent 40%)

                &.legendary:after
                    background-image linear-gradient(to top, rgba(218, 50, 23, .5), rgba(125, 5, 5, .5), transparent 40%)
</style>