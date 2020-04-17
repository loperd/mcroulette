<template>
    <div v-if="show" class="chest-inside animated fadeInUp" :class="{ fadeOutDown: hideInsides }">
        <div class="chest-inside__more-text">Предметы, которые могут быть в этом сундуке:</div>
        <vue-custom-scrollbar class="chest-inside__container" :settings="{
                minScrollbarLength: 60,
                suppressScrollX: true,
            }">
            <div v-for="item in items" :key="item.id" class="chest-inside__item">
                <div class="chest-inside__item-overlay"><div class="chest-inside__item-overlay_preview-image" :style="`background-image: url(${item.image})`"></div></div>
                <p class="chest-inside__item-title">{{ item.title }}</p>
            </div>
        </vue-custom-scrollbar>
        <div class="chest-inside__footer">
            <div class="chest-inside__buttons">
                <button class="btn btn-green" @click="open">Открыть Сундук</button>
                <button class="btn btn-transparent">Закрыть</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    /* eslint-disable */
    import { ChestPhysicalScene } from "@/component/Chest/Scene"
    import { Component, Vue, Watch } from "vue-property-decorator"
    import { CHEST_OPEN_EVENT, CHEST_OPENED_EVENT, SCENE_LOADED_EVENT } from "@/event"
    import { Inject } from "vue-di-container"
    import { BusEvent } from "ts-bus/types"
    import { EventBus } from "ts-bus"
    import EventName from "@/event/EventName"

    @Component
    export default class extends Vue
    {
        @Inject(EventBus) private bus!: EventBus

        private isOpen!: boolean
        private items!: object
        private show!: boolean
        private hideInsides!: boolean

        @Watch('isOpen')
        onChildChanged(value: boolean): void
        {
            if (!value)
                return

            setTimeout(() => this.show = false, 1000)
        }

        data(): any {
            return {
                isOpen: false,
                hideInsides: false,
                show: false,
                hide: false,
            }
        }

        created(): void
        {
            this.items = [
                {
                    id: 1,
                    title: "Vip",
                    image: this._img("7de3bb62825c11f969be67b4720a6fb5eaba9d69.png"),
                },
                {
                    id: 2,
                    title: "Premium",
                    image: this._img("33ae616445a689c5fd84b057e8f4441950d37362.png"),
                },
                {
                    id: 3,
                    title: "Creative",
                    image: this._img("bf5d1e948aa947b5f3a4580c6a94a06480e35b2a.png"),
                },
                {
                    id: 4,
                    title: "Admin",
                    image: this._img("5c0a4fc7c32f26dec6ff80e80471b4a93152d252.png"),
                },
                {
                    id: 5,
                    title: "Lord",
                    image: this._img("591694466c988d2530ca324a7590df69f20402bd.png"),
                },
                {
                    id: 6,
                    title: "Enigma",
                    image: this._img("d35a130b49a6bb29248ee21144ce68779bcd91f4.png"),
                },
                {
                    id: 7,
                    title: "Deluxe",
                    image: this._img("7505d64a54e061b7acd54ccd58b49dc43500b635.png"),
                },
                {
                    id: 8,
                    title: "Caesar",
                    image: this._img("7de3bb62825c11f969be67b4720a6fb5eaba9d69.png"),
                },
                {
                    id: 9,
                    title: "Baron",
                    image: "",
                },
                {
                    id: 10,
                    title: "Hero",
                    image: "",
                },
                {
                    id: 11,
                    title: "Sentinel",
                    image: "",
                },
                {
                    id: 12,
                    title: "Knight",
                    image: this._img("d35a130b49a6bb29248ee21144ce68779bcd91f4.png"),
                },
                {
                    id: 13,
                    title: "Emperor",
                    image: "",
                },
                {
                    id: 14,
                    title: "Czar",
                    image: "",
                },
                {
                    id: 15,
                    title: "King",
                    image: this._img("23f58b59e0d2291da1bf4a9ddea3255e3c643924.png"),
                },
                {
                    id: 16,
                    title: "Ruler",
                    image: "",
                },
                {
                    id: 17,
                    title: "Vice President",
                    image: "",
                },
                {
                    id: 18,
                    title: "President",
                    image: "",
                },
            ]
        }

        public mounted(): void
        {
            this.bus.subscribe(EventName.SCENE_LOADED, (e: BusEvent): void => {
                if (!(e.payload.scene instanceof ChestPhysicalScene)) {
                    return
                }

                this.show = true
            })
        }

        private open(): void
        {
            if (this.isOpen)
                return

            this.bus.publish(CHEST_OPEN_EVENT())
            this.hideInsides = true
            this.isOpen = true
        }

        private _img(s: string): string
        {
            return "/static/icon/" + s
        }
    }
</script>

<style lang="stylus" scoped>
    $moreTextFS = 18px
    $linePositionY = $moreTextFS + $moreTextFS

    chestInsideTextGradient()
        background linear-gradient(arguments)
        -webkit-text-fill-color transparent
        -webkit-background-clip text

    .chest-inside
        position: relative
        margin 0 auto
        padding 0 20px
        height 50vh
        top 50%
        width 100%
        bottom 0
        &:before
            content ''
            left 20px
            right 20px
            height 2px
            padding 0 20px
            position absolute
            top $linePositionY
            background-image radial-gradient(rgba(255, 255, 255, .1), rgba(255, 255, 255, .4), rgba(255, 255, 255, 1))
            box-shadow -20px 5px 11px 2px rgba(0, 0, 0, 0.5)
        &__more-text
            font-family 'M PLUS Rounded 1c', sans-serif
            text-align left
            font-weight: 600
            font-size $moreTextFS
            chestInsideTextGradient: 20deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, .35), rgba(255, 255, 255, .05)
        &__footer
            display inline-block
            width 100%
        &__buttons
            float right
            margin 20px 0
            & > button:first-child
                margin-right 15px
        &__container
            position relative
            overflow hidden
            width auto
            height 60%
            margin-top 20px
        &__item
            display inline-block
            position relative
            text-align center
            padding: 15px 0
            float left
            width 15%

            &-title
                text-shadow 6px 7px 10px #000000
                font-weight 700
                padding 6px 0 0
                color rgba(255, 255, 255, .9)

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
                    position absolute
                    height 100%
                    content ''
                    width 5px
                    left 0
                    top 0
                &.default:after
                    background-image linear-gradient(60deg, #6f0505, #ff1717)
                &.primary:after
                    background-image linear-gradient(to top, #8218e7, #512080)
                &_preview-image
                    background-repeat no-repeat
                    background-position center
                    background-size contain
                    border: 10px dashed transparent;
                    position relative
                    padding 0 10px
                    height 100%
                    width 100%
                    content ''

    @media screen and (min-width: 140px) and (max-width: 639px)
        .chest-inside
            &__item
                width 100%
                &-overlay
                    height 300px
                    width 100%
    @media screen and (max-width: 640px)
        .chest-inside
            &__buttons > *
                width 100%
                display block
                height 60px
                border-radius 0
    @media screen and (min-width: 640px) and (max-width: 767px)
        .chest-inside
            &__item
                width 50%
                &-overlay
                    height 250px
    @media screen and (max-width: 768px)
        .chest-inside
            &__footer
                justify-content center
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
            &__buttons
                margin 50px 0
    @media screen and (min-width: 2048px) and (max-width: 2559px)
        .chest-inside
            &__item
                width 10%
    @media screen and (min-width: 2560px) and (max-width: 3199px)
        .chest-inside
            &__item
                width 7%
</style>