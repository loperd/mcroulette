<template>
    <div>
        <canvas id="circle" resize/>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import { Circle } from "@/component"

    @Component
    export default class CenterCircle extends Vue
    {
        mounted(): void
        {
            new Circle("circle", .15).draw()
        }
    }
</script>

<style lang="stylus" scoped>
    #circle
        position absolute
        top 0
        left 0
        width 100%
        height 100%
</style>
