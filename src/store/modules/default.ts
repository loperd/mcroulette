import { Actions, Getters, Module, Mutations } from "vuex-smart-module"
import { Item } from "@/struct/Item"
import axios from "axios"
import _ from "lodash"
import {
    CREATE_COPY_PRIZE,
    CREATE_PRIZES,
    CLEAR_PRIZES,
    CHEST_OPEN,
    PULL_ITEMS, INJECT_PRIZE, SELECT_PRIZE
} from "@/store/modules/types"
import { randomInt } from "@/helper"

const _img = (s: string): string => "/static/icon/" + s

class DefaultState
{
    public selectedPrize: Item = Item.mock()
    public selectedPrizeIndex?: number = undefined
    public totalCountPrizes: number = 50
    public prizes: Item[] = new Array<Item>()
    public items: Item[] = new Array<Item>()
}

class DefaultGetters extends Getters<DefaultState>
{
    get prizes(): Item[]
    {
        return this.state.prizes
    }

    get items(): Item[]
    {
        return this.state.items
    }

    get prize(): Item | undefined
    {
        return this.state.selectedPrize
    }

    get prizeIndex(): number | undefined
    {
        return this.state.selectedPrizeIndex
    }

    get findItemById(): (id: string) => Item | undefined
    {
        return (id: string) => this.state.items.find(item => item.id === id)
    }
}

class DefaultMutations extends Mutations<DefaultState>
{
    public [CREATE_COPY_PRIZE] ({ prize, count }: { prize: Item, count: number }): void
    {
        for (let i = 0; i < count; i++)
            this.state.prizes.push(prize)
    }

    public [PULL_ITEMS] (items: Item[]): void
    {
        for (let item of items)
            this.state.items.push(new Item(item))
    }

    public [CLEAR_PRIZES] (): void
    {
        this.state.prizes = []
        this.state.selectedPrize = Item.mock()
        this.state.selectedPrizeIndex = undefined
    }

    public [SELECT_PRIZE] (prize: Item): void
    {
        this.state.selectedPrize = new Item(prize)
    }

    public [INJECT_PRIZE] (prize: Item): void
    {
        prize = new Item(prize)

        const selectedPrizeItems: number[] = new Array<number>()
        for (let [i, item] of this.state.prizes.entries()) {
            if (item.id === prize.id) {
                selectedPrizeItems.push(i + 1)
            }
        }

        if (selectedPrizeItems.length === 0) {
            // inject item if it doesn't exists in current prizes array
            this.state.selectedPrizeIndex = randomInt(1, this.state.totalCountPrizes)
            this.state.prizes.splice(this.state.selectedPrizeIndex - 1, 0, prize)
            return
        }

        // select one of more selected prize items
        this.state.selectedPrizeIndex = selectedPrizeItems[randomInt(1, selectedPrizeItems.length)]
    }
}

class DefaultActions extends Actions<DefaultState,
    DefaultGetters,
    DefaultMutations,
    DefaultActions>
{
    public async [CREATE_PRIZES] (): Promise<void>
    {
        await this.dispatch(PULL_ITEMS)

        this.commit(CLEAR_PRIZES)

        for (let prize of _.shuffle(this.state.items)) {
            let percent = this.state.totalCountPrizes / 100,
                percentCount = Math.round(percent * prize.chance)

            if ((this.state.totalCountPrizes -this.state.prizes.length) < percentCount) {
                percentCount = (this.state.totalCountPrizes - this.state.prizes.length)
            }

            this.commit(CREATE_COPY_PRIZE, { prize, count: percentCount })
        }
    }

    public async [CHEST_OPEN] (): Promise<void>
    {
        const response = await axios.get('/selected_prize.json')

        this.commit(SELECT_PRIZE, response.data)
        this.commit(INJECT_PRIZE, response.data)
    }

    public async [PULL_ITEMS] (): Promise<void>
    {
        if (0 !== this.state.items.length)
            return

        const response = await axios.get("/items.json", {
            headers: {
                "Content-Type": "application/json"
            }
        })

        this.commit(PULL_ITEMS, response.data)
    }
}

export const DefaultModule = new Module({
    state: DefaultState,
    getters: DefaultGetters,
    mutations: DefaultMutations,
    actions: DefaultActions
})