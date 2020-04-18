import { DefaultModule } from './modules/default'
import { createStore } from "vuex-smart-module"
import Vuex from "vuex"
import Vue from "vue"

Vue.use(Vuex)

export const store = createStore(DefaultModule)

