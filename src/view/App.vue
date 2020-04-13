<template>
    <div id="app">
        <vue-headful title="Mc Roulette"/>
        <div class="background">
            <div class="overlay"/>
        </div>
<!--        <center-circle/>-->
        <roulette/>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import CenterCircle from "./component/CenterCircle.vue"
    import Roulette from './component/Roulette.vue'

    @Component({
        components: {
            CenterCircle,
            Roulette,
        },
    })

    export default class App extends Vue
    {
        mount(): void
        {
        }
    }
</script>

<style lang="stylus">
    @import "~@/styles/main.styl"
</style>

<style lang="stylus" scoped>
    #app
        height 100%
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;

    .background
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position: relative
        overflow hidden
        height 100%
        z-index -1
        .overlay
            background-image url($backgroundImage)
            background-size: cover;
            overflow: hidden;
            filter blur(35px) brightness(1.2)
            position absolute
            margin auto
            bottom 0
            top 0
            left 0
            right 0
            height 100%
</style>
