<template>
    <div id="app">
        <div class="background">
            <div class="overlay"/>
        </div>
        <circle-center/>
        <chest/>
        <!--        <roulette/>-->
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Roulette from "./component/Roulette.vue"
    import CircleCenter from "./component/Circle.vue"
    import Chest from "./component/Chest.vue"

    @Component({
        components: {
            Chest,
            CircleCenter,
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
        font-family: Avenir, Helvetica, Arial, sans-serif
        -webkit-font-smoothing antialiased
        -moz-osx-font-smoothing grayscale
        text-align center
        overflow hidden
        position relative
        color #2c3e50

    .background
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position: relative
        height 100%
        z-index -1
</style>
