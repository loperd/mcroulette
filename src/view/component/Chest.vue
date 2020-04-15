<template>
    <div class="model" :id="id"></div>
</template>

<script lang="ts">
    import { bus, camera, loader, renderer } from "@/component/Chest"
    import { Component, Vue } from "vue-property-decorator"
    import { Chest } from "@/component"

    @Component
    export default class extends Vue
    {
        private chest: Chest
        private id: string = "chest"

        constructor()
        {
            super(); this.chest = new Chest(camera, renderer, loader, bus)
        }

        public async mounted(): Promise<void>
        {
            await this.chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)
            this.chest.swapActiveScene()
            this.renderCanvas()
            this.chest.play()
        }

        public open()
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