<template>
    <div v-if="isLoaded" class="chest-inside animated" :class="!isOpen ? 'fadeInUp' : 'fadeOutDown'">
        <div class="chest-inside__container">
            <div class="chest-inside__more-text">Items that may be in this chest:</div>
            <vue-custom-scrollbar class="chest-inside__container-items" :settings="{
                    minScrollbarLength: 60,
                    suppressScrollX: true,
            }">
                <div v-for="(item, i) in items" :key="`ci${item.id}-${i}`" class="chest-inside__item">
                    <div class="chest-inside__item-overlay" :class="item.type">
                        <div class="chest-inside__item-overlay_preview-image" :style="`background-image: url(${item.image})`"></div>
                    </div>
                    <p class="chest-inside__item-title">{{ item.title }}</p>
                </div>
            </vue-custom-scrollbar>
        </div>
        <div class="chest-inside__footer">
            <div class="chest-inside__buttons">
                <button class="btn btn-green" @click.prevent="open">Open Chest</button>
                <button class="btn btn-transparent">Close</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    /* eslint-disable */
    import { Component, Vue } from "vue-property-decorator"
    import { PULL_ITEMS } from "@/store/modules/types"
    import { CHEST_OPEN_EVENT } from "@/event"
    import EventName from "@/event/EventName"
    import { Inject } from "vue-di-container"
    import { Item } from "@/struct/Item"
    import { Getter } from "vuex-class"
    import { EventBus } from "ts-bus"

    @Component
    export default class extends Vue
    {
        @Inject(EventBus) private bus!: EventBus

        private isOpen: boolean = false
        private isLoaded: boolean = false

        @Getter items!: Item[]

        public async mounted(): Promise<void>
        {
            await this.$store.dispatch(PULL_ITEMS)

            this.bus.subscribe(EventName.LOADING_IS_COMPLETE, (): void => {
                this.isLoaded = true
            })

            this.bus.subscribe(EventName.CLOSE_WIN_SCREEN, () => {
                setTimeout(() => this.isOpen = false, 500)
            })
        }

        private open(): void
        {
            if (this.isOpen)
                return

            this.bus.publish(CHEST_OPEN_EVENT())
            this.isOpen = true
        }
    }
</script>

<style lang="stylus" scoped>
    $moreTextFS = 18px; $linePositionY = $moreTextFS + $moreTextFS

    chestInsideTextGradient()
        background linear-gradient(arguments)
        -webkit-text-fill-color transparent
        -webkit-background-clip text

    .chest-inside
        position: relative
        margin 0 auto
        height 100vh
        width 100%
        opacity 0
        bottom 0
        &__container
            position relative
            padding 0 50px
            width 100%
            height 50%
            top 50%
        &__more-text
            font-family "Exo 2", sans-serif
            user-select none
            pointer-events none
            position: relative
            padding 0 0 10px 0
            font-weight: 700
            text-align left
            z-index 1
            font-size $moreTextFS
            chestInsideTextGradient: 20deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, .35), rgba(255, 255, 255, .05)
            &:after
                content ''
                left 0
                right 0
                bottom 1px
                height 2px
                position absolute
                background-image radial-gradient(rgba(255, 255, 255, .1), rgba(255, 255, 255, .4), rgba(255, 255, 255, 1))
                box-shadow -20px 5px 11px 2px rgba(0, 0, 0, 0.5)
        &__footer
            position absolute
            right 10 + 50px
            bottom 10px
            width 100%
        &__buttons
            float right
            & > button:first-child
                margin-right 15px
        &__container-items
            overflow hidden
            padding 25px 0 0
            height calc(100% - 115px)
            width 100%
        &__item
            display inline-block
            position relative
            float left
            width 15%
            margin-bottom 15px
            &-title
                text-shadow 6px 7px 10px #000000
                color rgba(255, 255, 255, .9)
                font-family 'Exo 2', sans-serif
                user-select none
                font-weight 600
                padding 6px 0 0
                pointer-events none

            &-overlay
                display inline-block
                position relative
                height 150px
                width 90%
                &:before
                    background radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(210,210,210,1) 50%, rgba(87,87,87,1) 100%)
                    border-radius 5px
                    position absolute
                    height 100%
                    width 100%
                    content ''
                    left 0
                    top 0
                &:after
                    border-radius 7px 0 0 5px;
                    position absolute
                    height 100%
                    content ''
                    width 6px
                    left 0
                    top 0
                &.default:after
                    background-image linear-gradient(to bottom, #005bff, #05315f)
                &.primary:after
                    background-image linear-gradient(to bottom, #8846c7, #2a0052)
                &.legendary:after
                    background-image linear-gradient(to bottom, #da3217, #4c0b0b)
                &_preview-image
                    background-repeat no-repeat
                    background-position center
                    background-size contain
                    border: 10px dashed transparent;
                    position relative
                    height 100%
                    width 100%
                    content ''


    @media screen and (max-width: 470px)
        .chest-inside
            &__container
                &:before
                    top $linePositionY + 26px
                    left -10px
    @media screen and (max-height: 320px)
        .chest-inside
            &__container
                display none
    @media screen and (min-width: 140px) and (max-width: 639px)
        .chest-inside
            &__item
                width 100%
                &-overlay
                    height 300px
                    width 100%
    @media screen and (min-width: 640px) and (max-width: 767px)
        .chest-inside
            &__item
                width 50%
                &-overlay
                    height 250px
    @media screen and (max-width: 768px)
        .chest-inside
            &__footer
                bottom 10px
                width 100%
                right 0
    @media screen and (max-width: 640px)
        .chest-inside
            &__footer
                left 0
            &__buttons
                width: 100%
                & > *
                    width 100%
                    display block
                    height 60px
                    border-radius 0
    @media screen and (min-width: 768px) and (max-width: 1023px)
        .chest-inside
            &__item
                width 50%
                &-overlay
                    height 250px
    @media screen and (min-width: 1024px) and (max-width: 1119px)
        .chest-inside
            &__item
                width 24%
                &-overlay
                    height 200px
    @media screen and (min-width: 1120px) and (max-width: 1151px)
        .chest-inside
            &__item
                width 20%
    @media screen and (min-width: 1152px) and (max-width: 1279px)
        .chest-inside
            &__item
                width 20%

    @media screen and (max-width: 1365px)
        .chest-inside
            &__container
                padding 0 20px
                &:before
                    left 20px
                    right 20 + 12px
    @media screen and (min-width: 1280px) and (max-width: 1365px)
        .chest-inside
            &__item
                width 20%
    @media screen and (min-width: 1366px) and (max-width: 1599px)
        .chest-inside
            &__item
                width 14%
    @media screen and (min-width: 1600px) and (max-width: 1919px)
        .chest-inside
            &__item
                width 14%
    @media screen and (min-width: 1920px) and (max-width: 2047px)
        .chest-inside
            &__item
                width 10%
    @media screen and (min-width: 2048px) and (max-width: 2559px)
        .chest-inside
            &__item
                width 10%
    @media screen and (min-width: 2560px) and (max-width: 3199px)
        .chest-inside
            &__item
                width 7%
</style>