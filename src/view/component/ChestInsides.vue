<template>
    <div class="chest-inside">
        <div class="chest-inside__more-text">Предметы, которые могут быть в этом сундуке:</div>
        <div class="chest-inside__container">
            <div v-for="item in items" :key="item.id" class="chest-inside__item">
                <div class="chest-inside__item-overlay"><div class="chest-inside__item-overlay_preview-image" :style="`background-image: url(${item.image})`"></div></div>
                <p class="chest-inside__item-title">{{ item.title }}</p>
            </div>
        </div>
        <div class="chest-inside__footer">
            <div class="chest-inside__buttons">
                <button class="btn btn-green">Открыть Сундук</button>
                <button class="btn btn-transparent">Закрыть</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">

    import { Component, Vue } from "vue-property-decorator"

    @Component
    export default class extends Vue
    {
        private items: any | object

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

        mounted(): void
        {
        }

        private _img(s: string): string
        {
            return "/static/icon/" + s
        }
    }
</script>

<style lang="stylus" scoped>
    $moreTextFS = 18px
    $linePositionY = $moreTextFS + $moreTextFS / 1.5px

    chestInsideTextGradient()
        background linear-gradient(arguments)
        -webkit-text-fill-color transparent
        -webkit-background-clip text

    .chest-inside
        position: relative
        height 50%
        top 50%
        bottom 0
        left 5%
        right 5%

        &:before
            width 100%
            position absolute
            content ''
            height 2px
            top $linePositionY
            left 10px
            background-image radial-gradient(rgba(255, 255, 255, .1), rgba(255, 255, 255, .4), rgba(255, 255, 255, 1))
            box-shadow -20px 5px 11px 2px rgba(0, 0, 0, 0.5)

        &__more-text
            font-family 'M PLUS Rounded 1c', sans-serif
            text-align left
            margin-left 10px
            font-weight: 600
            font-size $moreTextFS
            chestInsideTextGradient: 20deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, .35), rgba(255, 255, 255, .05)

        &__footer
            bottom 20px
            width 100%
            left 0

        &__buttons
            /*float right*/
            .btn:first-child
                margin-right 20px

        &__container
            overflow-y auto
            position relative
            width auto
            height 65%
            margin-top 20px

            &::-webkit-scrollbar
                width .5em

            &::-webkit-scrollbar-track
                box-shadow none

            &::-webkit-scrollbar-thumb
                background-image linear-gradient(45deg, #ffffff25, #ffffff50)
                border-radius 10px
                outline 0

        &__item
            display inline-block
            position relative
            margin 10px 12px
            float left

            &-title
                text-shadow 6px 7px 10px #000000
                font-weight 700
                padding 6px 0 0
                color rgba(255, 255, 255, .9)

            &-overlay
                position relative
                height 150px
                width 200px
                &:before
                    background radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(210,210,210,1) 50%, rgba(87,87,87,1) 100%)
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
</style>