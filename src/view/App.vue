<template>
    <div id="app">
        <circle resize></circle>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from "vue-property-decorator"
    import Circle from "@/view/component/Circle.vue"

    @Component({
        components: {
            Circle,
        },
    })
    export default class App extends Vue {}
</script>

<style type="text/stylus" scoped>
    #app
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;
        margin-top: 60px;

    body, html
        height 100%
        overflow hidden

    .background
        background-image url("../assets/images/minecraft_bg.jpg")
        background-position center
        background-repeat no-repeat
        background-size cover
        overflow hidden
        height 100%
        position: relative
        z-index -1

    .overlay
        background-image url("../assets/images/minecraft_bg.jpg")
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
