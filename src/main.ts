import vueCustomScrollbar from 'vue-custom-scrollbar'
import App from "./view/App.vue"
import store from "./store"
import Vue from "vue"

Vue.config.productionTip = false
Vue.component('vue-custom-scrollbar', vueCustomScrollbar)
const render = h => h(App)

new Vue({
    render,
    store,
}).$mount('#app')