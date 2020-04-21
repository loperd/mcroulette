<template>
    <div class="win-screen" :class="show ? 'blurIn' : 'blurOut'">
        <CircleCenter></CircleCenter>
        <div class="win-screen__container">
            <div class="win-screen__item-title" :class="item.type">{{ item.title }}</div>
            <div class="win-screen__item-image" :style="`background-image: url(${item.image})`"></div>
            <div class="win-screen__footer">
                <button class="btn btn-transparent" @click.prevent="close">Закрыть</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import UnexpectedErrorException from "@/component/Roulette/Exception/UnexpectedErrorException"
    import { Component, Vue, Watch } from "vue-property-decorator"
    import { CLOSE_WIN_SCREEN_EVENT, EventName } from "@/event"
    import Prize from "@/component/Roulette/Prize"
    import { Inject } from "vue-di-container"
    import CircleCenter from "./Circle.vue"
    import { BusEvent } from "ts-bus/types"
    import { Item } from "@/struct/Item"
    import { Getter } from "vuex-class"
    import { EventBus } from "ts-bus"

    @Component({ components: { CircleCenter } })
    export default class extends Vue
    {
        @Inject(EventBus) private bus!: EventBus

        private item?: Item;
        public name: string = "WinScreen"
        private prize: null | Prize = null
        private show: boolean = false

        @Getter findItemById!: (id: string) => Item

        constructor() {
            super(); this.item = new Item("0", "default", "img", "default", 100)
        }

        @Watch("prize")
        public selectPrizeItem(): void
        {
            if (!this.prize)
                return

            let itemId = this.prize?.itemId || "",
                item = this.findItemById(itemId)

            if (!item) {
                throw new UnexpectedErrorException(`Can not find item with id #${itemId}.`)
            }

            this.item = item
        }

        close(): void
        {
            this.bus.publish(CLOSE_WIN_SCREEN_EVENT())
            setTimeout(() => this.show = false, 500)
        }

        public mounted(): void
        {
            this.bus.subscribe(EventName.ROULETTE_STOPPED, (e: BusEvent) =>
            {
                this.prize = e.payload.prize
                this.show = true
            })
        }
    }
</script>

<style lang="stylus" scoped>
    .win-screen
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position: absolute
        height 100%
        width 100%
        content ''
        left 0
        top 0

        &__container
            position: relative
            margin: 0 auto
            height 100%
            width 50%

        &__item-title
            text-shadow 8px 5px 10px rgba(26, 26, 26, 0.55)
            font-family 'Exo 2', sans-serif
            font-weight 600
            position relative
            padding 20px 0
            font-size 2.5em
            color #fff

            &:after
                transform translate(-50%, 0)
                box-shadow 9px 9px 7px 0 rgba(26, 26, 26, 0.55)
                border-radius 1px
                position absolute
                height 5px
                content ''
                width 25%
                left 50%
                bottom 0

            &.default:after
                background-image linear-gradient(90deg, #005bff, #0c5399)

            &.primary:after
                background-image linear-gradient(90deg, #8846c7, #671ab4)

            &.legendary:after
                background-image linear-gradient(90deg, #da3217, #9a1616)

        &__item-image
            transform translate(-50%, -50%)
            background-repeat no-repeat
            background-position center
            background-size contain
            position absolute
            height 50%
            width 50%
            left 50%
            top 50%
            content ''

        &__footer
            position: absolute
            bottom 20px
            width 100%

            > .btn
                float right

    @media screen and (max-height: 640px)
        .win-screen
            &__item-image
                height 100vh
</style>