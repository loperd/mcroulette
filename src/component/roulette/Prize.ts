import { roulettePrizeClass } from "@/component/roulette/config"

class Prize
{
    public wrapper: HTMLLIElement
    public element: any
    public index: number

    constructor(element: Element, index: number, spacing: number, width: number, height: number)
    {
        this.element = element
        this.index = index

        let wrapper = document.createElement("li")
        wrapper.classList.add(roulettePrizeClass)
        wrapper.style.marginRight = `${spacing}px`
        wrapper.style.minWidth = `${width}px`
        wrapper.style.minHeight = `${height}px`
        wrapper.appendChild(element)

        this.wrapper = wrapper
    }
}

export default Prize