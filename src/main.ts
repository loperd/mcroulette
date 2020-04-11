import vueHeadful from 'vue-headful';
import App from './view/App.vue'
import Vue from 'vue'

Vue.config.productionTip = false
Vue.component('vue-headful', vueHeadful);

new Vue({
  render: h => h(App),
}).$mount('#app')
