import actions from "./actions"
import getters from "./getters"
import state from "./state"
import Vuex from "vuex"
import Vue from "vue"

Vue.use(Vuex)

export default new Vuex.Store({
    state,
    actions,
    getters,
});

