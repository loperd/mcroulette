import { roulettePrizeClass } from "@/component/Roulette/config"
import UnexpectedErrorException from "@/component/Roulette/Exception/UnexpectedErrorException"

class Prize
{
    public readonly elements: HTMLLIElement[] = new Array<HTMLLIElement>()

    public itemId: string
    public index: number

    constructor(item: string, index: number)
    {
        this.index = index
        this.itemId = item
    }

    public addEl(el: HTMLLIElement): void
    {
        this.elements.push(el)
    }

    public get defaultElement(): HTMLLIElement
    {
        if (this.elements.length === 0)
            throw new UnexpectedErrorException('Prize has no elements')

        return this.elements[0]
    }

    marginLeft(margin: number): void
    {
        this.elements.forEach(el => el.style.marginLeft = `${margin}px`)
    }
}

export default Prize