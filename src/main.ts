import App from "./view/App.vue"
import store from "./store"
import Vue from "vue"

Vue.config.productionTip = false

const render = h => h(App)

new Vue({
    render,
    store,
}).$mount('#app')