<template>
    <div id="app">
        <div class="background">
            <div class="overlay"/>
        </div>
        <center-circle resize/>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import CenterCircle from "./component/CenterCircle.vue"

    @Component({
        components: {
            CenterCircle,
        },
    })

    export default class App extends Vue {}
</script>

<style lang="stylus" scoped>
    $bg_image = "../assets/images/minecraft_bg.jpg"

    body, html, #app
        height 100%
        overflow hidden

    #app
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;

    .background
        background-image url($bg_image)
        background-position center
        background-repeat no-repeat
        background-size cover
        position: relative
        overflow hidden
        height 100%
        z-index -1

    .overlay
        background-image url($bg_image)
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
