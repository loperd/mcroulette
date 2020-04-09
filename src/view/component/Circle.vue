<template>
    <canvas id="circle"/>
</template>


<script lang="ts">
    import { Vue } from "vue-property-decorator"
    import { Circle as BlackCircle } from "@/js/component"

    export default class Circle extends Vue
    {

        mounted()
        {
            new BlackCircle('circle', .15).draw()
        }
    }
</script>

<style type="text/stylus" scoped>
    #circle
        position absolute
        top 0
        left 0
        width 100%
        height 100%
</style>
