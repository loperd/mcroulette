<template>
    <div v-if="show" class="loader animated">
        <div class="loader__container animated flash infinite">
            <div class="loader__title animated">LOADING</div>
            <div class="loader__progress-bar"></div>
        </div>
    </div>
</template>

<script lang="ts">
    import { Vue, Component } from "vue-property-decorator"
    import { Inject } from "vue-di-container"
    import * as THREE from 'three'
    import { EventBus } from "ts-bus"
    import { LOADING_IS_COMPLETE_EVENT } from "@/event"

    @Component
    export default class extends Vue {
        @Inject(THREE.LoadingManager) manager!: THREE.LoadingManager
        @Inject(EventBus) bus!: EventBus

        name: string = "Loader"
        show: boolean = true

        mounted(): void
        {
            const progressBar = document.querySelector<HTMLDivElement>('.loader__progress-bar')
            const container = document.querySelector<HTMLDivElement>('.loader__container')
            const loadingTitle = document.querySelector<HTMLDivElement>('.loader__title')
            const loader = document.querySelector<HTMLDivElement>('.loader')

            if (null === progressBar || null === loadingTitle || null === loader || null === container)
                throw 'Can not setup loader'

            let loadedPercent = 0
            this.manager.onProgress = (url, loaded: number, total: number) => {
                let percent = loaded / total * 100

                loadedPercent = loadedPercent >= percent
                    ? loadedPercent
                    : percent

                // @ts-ignore
                progressBar.style.width = loadedPercent.toString() + '%'

                if (loadedPercent >= 90)
                    loadingTitle.classList.remove('infinite')

                if (loadedPercent <= 95)
                    return

                setTimeout(() => this.bus.publish(LOADING_IS_COMPLETE_EVENT()), 2400)
                setTimeout(() => container.classList.add('fadeOutUp'), 800)
                setTimeout(() => container.style.display = 'none', 1400)
                setTimeout(() => loader.classList.add('fadeOutUp'), 1600)
                setTimeout(() => this.show = false, 2400)
            }
        }
    }
</script>

<style lang="stylus" scoped>
    .loader
        background radial-gradient(circle at 50%, #000000, #000000, #000000)
        justify-content center
        pointer-events none
        align-items center
        user-select none
        position fixed
        display flex
        height 100%
        width 100%
        z-index 10
        content ''
        top 0
        left 0

        &__container
            width 50%
            > *:first-child
                margin-bottom 20px
            > *
                display block

        &__title
            font-family 'Orbitron', sans-serif
            text-transform uppercase
            font-weight 400
            font-size 2em
            color #fff
            left 50%
            top 45%

        &__progress-bar
            transition width 1s
            position relative
            background linear-gradient(25deg, #333, #fff)
            box-shadow -1px 1px 12px 1px #464646
            width 0
            content ''
            height .11em

</style>