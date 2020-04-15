import { ContainerUndefinedException } from "@/component/Roulette/Exception"
import Prize from "./Prize"

export default class ListManager
{
    public backgroundList?: HTMLUListElement
    private zoomList: HTMLUListElement

    constructor(zoomListId: string, backgroundListId?: string)
    {
        const zoomList = document.querySelector<HTMLUListElement>(zoomListId)

        if (null === zoomList)
            throw new ContainerUndefinedException()

        this.zoomList = zoomList

        this.setBackgroundList(backgroundListId)
    }

    public get offsetLeft(): number
    {
        return this.defaultList.offsetLeft
    }

    public get defaultList(): HTMLUListElement
    {
        return this.zoomList
    }

    public appendChild(el: Prize): void
    {
        this.defaultList.appendChild(el.defaultElement)

        if (undefined !== this.backgroundList && undefined !== el.linkedElement)
            this.backgroundList.appendChild(el.linkedElement)
    }

    private setBackgroundList(backgroundListId: string | undefined): void
    {
        if (undefined === backgroundListId)
            return

        this.backgroundList = document.querySelector<HTMLUListElement>(backgroundListId) || undefined
    }
}