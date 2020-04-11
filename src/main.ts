import vueHeadful from 'vue-headful';
import App from './view/App.vue'
import Vue from 'vue'

Vue.config.productionTip = false
Vue.component('vue-headful', vueHeadful);

new Vue({
  render: h => h(App),
}).$mount('#app')

// import { bus, camera, loader, renderer } from "./bootstrap"
// import { CHEST_OPENED_EVENT } from "./event"
// import { Circle } from "./component"
// import { Chest } from "./chest"
// import "./styles/main.styl"
//
// window.onload = async () =>
// {
//   new Circle("circle", .15).draw()
//
//   const chest = new Chest(camera, renderer, loader, bus)
//   await chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)
//
//   chest.swapActiveScene()
//   chest.play()
//
//
//   await bus.subscribe(CHEST_OPENED_EVENT, () => console.log('Chest opened'))
//
//   setTimeout(() => {
//     chest.swapActiveScene()
//
//     chest.open()
//   }, 5000)
//
//
//   setTimeout(() => {
//     chest.reset().swapActiveScene()
//
//     setTimeout(() => {
//       chest.swapActiveScene()
//
//       chest.open()
//     }, 5000)
//   }, 15000)
//
//   const rendererEl = renderer.domElement
//   rendererEl.setAttribute("id", "case")
//   document.body.appendChild(rendererEl)
// }