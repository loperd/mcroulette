/* eslint-disable */
import { rouletteListClass } from "@/component/Roulette/config"
import Prize from "./Prize"

export default class ListManager
{
    private lists: Array<HTMLUListElement> = new Array<HTMLUListElement>()

    constructor(private selector: string) {}

    public reset(): void
    {
        this.lists = new Array<HTMLUListElement>()
    }

    public init(): void
    {
        document.querySelectorAll<HTMLElement>(this.selector).forEach((el: HTMLElement) => {
            let list = document.createElement("ul")
            list.classList.add(rouletteListClass)
            el.appendChild(list)
            this.lists.push(list)
        })
    }

    public get defaultList(): HTMLUListElement
    {
        if (0 === this.lists.length)
            throw "ListManager was not initialized"

        return this.lists[0]
    }

    public get offsetLeft(): number
    {
        return this.defaultList.offsetLeft
    }

    public addChild(el: HTMLLIElement, prize: Prize): Prize
    {
        this.lists.forEach(list => {
            const element = el.cloneNode(true)
            prize.addEl(<HTMLLIElement>element)
            list.appendChild(element)
        })

        return prize
    }

    public appendChild(prize: Prize): void
    {
        // List index equals prize element index
        this.lists.forEach((list, index) => list.appendChild(prize.elements[index]))
    }
}