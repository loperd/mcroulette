<template>
    <div class="model" :id="id"></div>
</template>

<script lang="ts">
    /* eslint-disable */
    import { loader, renderer } from "@/component/Chest"
    import { ChestPhysicalScene } from "@/component/Chest/Scene"
    import { Component, Vue } from "vue-property-decorator"
    import { Inject } from "vue-di-container"
    import { BusEvent } from "ts-bus/types"
    import { Chest } from "@/component"
    import { EventBus } from "ts-bus"
    import EventName from "@/event/EventName"

    @Component
    export default class extends Vue
    {
        public name: string = 'Chest'
        private id: string = "chest"
        private chest!: Chest

        @Inject(EventBus) private bus!: EventBus

        public created(): void
        {
            this.chest = new Chest(renderer, loader, this.bus)
            this.chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)
        }

        public async mounted(): Promise<void>
        {
            this.chest.swapActiveScene()
            this.renderCanvas()

            this.bus.subscribe(EventName.LOADING_IS_COMPLETE, () => this.chest.play())
            this.bus.subscribe(EventName.CHEST_OPEN, () => this.open())
            this.bus.subscribe(EventName.CLOSE_WIN_SCREEN, () => {
                this.chest.reset().swapActiveScene().play()
            })
        }

        public open(): void
        {
            this.chest.swapActiveScene()
            this.chest.open()
        }

        public renderCanvas(): void
        {
            const
                rendererEl = renderer.domElement,
                chest = document.getElementById(this.id)

            if (null === chest)
                throw new Error(`Can not find element with id #${this.id} in body`)

            chest.appendChild(rendererEl)
        }
    }
</script>

<style lang="stylus" scoped>
    .model
        position absolute
        top 0
        left 0
        width 100%
        height 100%
</style>