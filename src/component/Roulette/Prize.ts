import { roulettePrizeClass } from "@/component/Roulette/config"

class Prize
{
    private _linkedElement?: HTMLLIElement
    private element: HTMLLIElement
    public index: number

    constructor(element: HTMLLIElement, index: number, spacing: number, width: number, height: number)
    {
        this.index = index

        element.classList.add(roulettePrizeClass)
        element.style.marginRight = `${spacing}px`
        element.style.minHeight = `${height}px`
        element.style.minWidth = `${width}px`

        this.element = element
    }

    public linkTo(el: HTMLLIElement): void
    {
        this._linkedElement = el
    }

    public get defaultElement(): HTMLLIElement
    {
        return this.element
    }

    public get linkedElement(): HTMLLIElement | undefined
    {
        return this._linkedElement
    }

    marginLeft(margin: number): void
    {
        this.defaultElement.style.marginLeft = `${margin}px`

        if (undefined === this.linkedElement)
            return

        this.linkedElement.style.marginLeft = `${margin}px`
    }
}

export default Prize