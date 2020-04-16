<template>
    <div class="chest-inside">
        <div class="chest-inside__more-text">Предметы, которые могут быть в этом сундуке:</div>

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
        mounted(): void
        {
        }
    }
</script>

<style lang="stylus" scoped>
    $moreTextFS = 18px
    $linePositionY = $moreTextFS + $moreTextFS/2px

    .chest-inside
        position: absolute
        width: 90%;
        height 50%
        bottom 0
        left 5%
        right 5%
        &:before
            width 100%
            position absolute
            content ''
            height 2px
            top $linePositionY
            left 0
            background-image radial-gradient(rgba(255, 255, 255, .1), rgba(255, 255, 255, .4), rgba(255, 255, 255, 1))
            box-shadow -20px 5px 11px 2px rgba(0, 0, 0, 0.5)
        &__more-text
            font-family 'M PLUS Rounded 1c', sans-serif
            text-align left
            font-weight: 600
            font-size $moreTextFS
            background linear-gradient(20deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, .35), rgba(255, 255, 255, .05))
            -webkit-background-clip text
            -webkit-text-fill-color transparent
        &__footer
            position absolute
            bottom 20px
            width 100%
            left 0
        &__buttons
            float right
            .btn:first-child
                margin-right 20px
</style>