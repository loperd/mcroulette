import { Getters, Mutations, Actions, Module } from 'vuex-smart-module'
import { Item } from "@/struct/Item"

const _img = (s: string): string => "/static/icon/" + s

class DefaultState {
    items: Item[] = new Array<Item>(
        new Item(1, "Vip", _img("7de3bb62825c11f969be67b4720a6fb5eaba9d69.png"), "default"),
        new Item(2, "Premium", _img("33ae616445a689c5fd84b057e8f4441950d37362.png"), "default"),
        new Item(3, "Creative", _img("bf5d1e948aa947b5f3a4580c6a94a06480e35b2a.png"), "default"),
        new Item(4, "Admin", _img("5c0a4fc7c32f26dec6ff80e80471b4a93152d252.png"), "default"),
        new Item(5, "Lord", _img("591694466c988d2530ca324a7590df69f20402bd.png"), "default"),
        new Item(6, "Enigma", _img("d35a130b49a6bb29248ee21144ce68779bcd91f4.png"), "default"),
        new Item(7, "Deluxe", _img("7505d64a54e061b7acd54ccd58b49dc43500b635.png"), "default"),
        new Item(8, "Caesar", _img("eca4d8fb36546ac643bb2a27584b4522034e358a.png"), "primary"),
        new Item(9, "Baron", _img("672410c017e7b495ddcaab02fa638e1c80443fdd.png"), "primary"),
        new Item(10, "Hero", _img("9c255818396a81ebc9b3ba6a85af9edd13116e72.png"), "primary"),
        new Item(11, "Sentinel", _img("da39a3ee5e6b4b0d3255bfef95601890afd80709.jpg"), "primary"),
        new Item(12, "Emperor", _img("754d2e97bafe87cf79fea733afb2a09bab2db7e3.png"), "primary"),
        new Item(13, "Ruler", _img("99160cc08d029f4ba966d6d95aee97323f8483ee.png"), "legendary"),
        new Item(13, "King", _img("23f58b59e0d2291da1bf4a9ddea3255e3c643924.png"), "legendary"),
    )
}

class DefaultGetters extends Getters<DefaultState> {
    get items(): Item[]
    {
        return this.state.items
    }
    get getItemById() {
        return this.state.items.find(item => item.id)
    }
}

class DefaultMutations extends Mutations<DefaultState> {}

class DefaultActions extends Actions<
    DefaultState,
    DefaultGetters,
    DefaultMutations,
    DefaultActions
> {}

export const DefaultModule = new Module({
    state: DefaultState,
    getters: DefaultGetters,
    mutations: DefaultMutations,
    actions: DefaultActions
})