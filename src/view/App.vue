<template>
    <div id="app">
        <circle-center/>
        <chest/>
        <chest-insides/>
        <!--        <roulette/>-->
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import ChestInsides from "./component/ChestInsides.vue"
    import CircleCenter from "./component/Circle.vue"
    import Roulette from "./component/Roulette.vue"
    import Chest from "./component/Chest.vue"

    @Component({
        components: {
            Chest,
            ChestInsides,
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
        font-family 'M PLUS Rounded 1c', sans-serif
        -webkit-font-smoothing antialiased
        -moz-osx-font-smoothing grayscale
        text-align center
        overflow hidden
        height 100%
        background-image url($backgroundImage)
        background-position center
        background-repeat no-repeat
        background-size cover
        position: relative
        color #2c3e50
</style>
