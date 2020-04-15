import Vuex from "vuex"
import Vue from "vue"

import actions from "./actions"
import state from "./state"

Vue.use(Vuex)

export default new Vuex.Store({
    state,
    actions,
});

