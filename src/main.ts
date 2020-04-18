import VueCustomScrollbar from "vue-custom-scrollbar"
import { VueDiContainer } from "vue-di-container"
import { EventBus } from "ts-bus"
import App from "./view/App.vue"
import { store } from "./store"
import Vue from "vue"

Vue.config.productionTip = false

Vue.component("vue-custom-scrollbar", VueCustomScrollbar)

Vue.use(VueDiContainer)

new Vue({
    render: h => h(App),
    diProvide: [EventBus],
    store,
}).$mount("#app")