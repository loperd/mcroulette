import Prize from "@/component/Roulette/Prize"
import {
    rotationStartEventName,
    rotationStopEventName,
    rouletteClass,
    rouletteListClass,
    roulettePrizeClass
} from "@/component/Roulette/config"
import {
    ContainerUndefinedException,
    ItemsNotFoundException,
    NotEnoughArgumentsException,
    PrizeNotFoundException,
    RotationIsAlreadyActiveException,
} from "./Exception"

class Roulette
{
    private readonly audio: null | HTMLAudioElement
    private readonly prizes: Prize[]

    private readonly acceleration: number
    private readonly prizeWidth: number
    private readonly spacing: number
    private readonly width: number
    private readonly fps: number
    private container: HTMLElement

    private list: HTMLUListElement
    private rotationTokens: WeakMap<this, number> = new WeakMap<this, number>()

    constructor(container: string, {
        spacing = 10,
        acceleration = 350,
        fps = 40,
        audio = null,
        selector = ":scope > *",
        stopCallback = null,
        startCallback = null
    }: {
        startCallback?: null | (() => any)
        stopCallback?: null | (() => any)
        acceleration?: number
        spacing?: number
        fps?: number
        audio?: string | null
        selector?: string
    })
    {
        audio = audio || "@/assets/audio/click.wav"

        let node: null | HTMLElement = document.querySelector<HTMLElement>(container)

        if (!(node instanceof HTMLElement))
            throw new ContainerUndefinedException()

        node.classList.add(rouletteClass)

        let list = document.createElement("ul")
        list.classList.add(rouletteListClass)

        let childNodes = [...node.querySelectorAll<HTMLElement>(selector)]

        if (!childNodes.length)
            throw new ItemsNotFoundException

        let injector = childNodes[0].parentElement
        let maxWidth = Math.max(...childNodes.map(x => x.clientWidth))
        let maxHeight = Math.max(...childNodes.map(x => x.clientHeight))
        let prizes = childNodes.map(
            (el: HTMLElement, i: number) =>
                new Prize(el, i, spacing, maxWidth, maxHeight)
        )

        for (let prize of prizes)
            list.appendChild(prize.wrapper)


        // TODO: разобраться с этой хернёй
        // node.style.padding = `${spacing}px`
        injector?.appendChild(list)

        let player = new Audio(audio)

        // @ts-ignore
        if (player && !player.clone)
            // @ts-ignore
            player.clone = player.cloneNode ? player.cloneNode : () => player

        this.list = list
        this.prizes = prizes
        this.container = node
        this.spacing = spacing
        this.acceleration = acceleration
        this.width = (spacing + maxWidth) * prizes.length
        this.prizeWidth = maxWidth
        this.audio = player
        this.fps = fps
        this.rotationTokens.set(this, -1)

        if (startCallback)
            this.container.addEventListener(rotationStartEventName, startCallback)
        if (stopCallback)
            this.container.addEventListener(rotationStopEventName, stopCallback)
    }

    rotate(pixels: number = 0): void
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        if (pixels < 0)
            throw new NotEnoughArgumentsException()

        this.rotateForward(pixels)
    }

    public rotateTo(block: Element | number, { tracks = 0, time = 0, random = true }: {
        tracks?: number
        time?: number
        random?: boolean
    }): void
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        let numBlock = Number(block)
        let prize = Number.isNaN(numBlock)
            ? this.findPrize({ element: <Element>block })
            : this.findPrize({ index: numBlock })

        if (this.selectedPrize.index === prize.index && !time && !tracks)
            return

        if (time) {
            this.rotateByTime(prize, time, random)
            return
        }

        this.rotateByTracks(prize, tracks, random)
    }

    playClick(): void
    {
        if (this.audio) {
            let promise = this.audio["clone"]().play()
            if (promise && promise.catch)
                promise.catch(() => {})
        }
    }

    public findPrize({ element, index = NaN }: {
        element?: Element
        index?: number
    }): Prize {
        if (Number.isNaN(index) && undefined === element)
            throw new NotEnoughArgumentsException()

        if (index > 0) {
            return this.prizes[index]
        }

        const result = this.prizes.find(x => x.element === element)

        if (undefined === result)
            throw new PrizeNotFoundException()

        return result
    }

    public stop(): void
    {
        if (!this.rotates) {
            return
        }

        clearInterval(this.rotationTokens.get(this))
        this.rotationTokens.set(this, -1)
        this.container.dispatchEvent(new CustomEvent(rotationStopEventName, { detail: { prize: this.selectedPrize } }))
    }

    get selectedPrize(): Prize
    {
        let afterCenter = this.prizes.concat()
            .sort((a: Prize, b: Prize) => a.wrapper.offsetLeft - b.wrapper.offsetLeft)
            .find(prize => prize.wrapper.offsetLeft > this.center)

        if (undefined === afterCenter)
            throw new Error("afterCenter is undefined")

        return this.prizes[(this.prizes.length + afterCenter.index - 1) % this.prizes.length]
    }

    get firstBlock(): Prize
    {
        return this.findPrize({ element: this.list.querySelector(`:scope > .${roulettePrizeClass} > *`) || undefined })
    }

    get lastBlock(): Prize
    {
        let nodes = this.list.querySelectorAll(`:scope > .${roulettePrizeClass} > *`)
        return this.findPrize({ element: nodes[nodes.length - 1] })
    }

    get rotates(): boolean
    {
        return (this.rotationTokens.get(this) || -1) > -1
    }

    get center(): number
    {
        return this.list.offsetLeft + this.list.clientWidth / 2
    }

    static get version(): string
    {
        return "1.1.0"
    }

    rotateForward(pixels: number): void
    {
        this.container.dispatchEvent(new CustomEvent(rotationStartEventName, { detail: { prize: this.selectedPrize } }))

        pixels = Math.abs(pixels)

        let starter = Math.abs(Number(this.firstBlock.wrapper.style.marginLeft.replace("px", "")))

        let
            k = this.acceleration,
            v0 = Math.sqrt(2 * k * pixels),
            totalTime = v0 / k

        let
            intervalMS = 1000 / this.fps,
            intervalS = intervalMS / 1000

        let
            halfBlock = this.spacing + this.prizeWidth / 2,
            blockWidth = this.prizeWidth + this.spacing,
            currentBlock = 0,
            played = false,
            t = 0

        let token = setInterval(() =>
        {
            if (t > totalTime) {
                this.stop()
                return
            }

            let currentPos = (starter + (v0 * t - k * t * t / 2)) % this.width
            let margin = currentPos % blockWidth

            if (Math.floor(currentPos / blockWidth) !== currentBlock) {
                let block = this.firstBlock
                this.list.appendChild(block.wrapper)
                block.wrapper.style.marginLeft = "0px"
                currentBlock = (currentBlock + 1) % this.prizes.length
                played = false
            }

            this.firstBlock.wrapper.style.marginLeft = `-${margin}px`

            if (margin > halfBlock && !played) {
                played = true
                this.playClick()
            }

            t += intervalS

        }, intervalMS)

        this.rotationTokens.set(this, token)
    }

    rotateByTracks(prize: Prize, tracks: number, random: boolean): void
    {
        const
            blockWidth = this.prizeWidth + this.spacing,
            currentBlock = this.selectedPrize
        let
            currentPosition = currentBlock.index * blockWidth + (this.center - currentBlock.wrapper.offsetLeft),
            destination = prize.index * blockWidth + this.spacing + this.prizeWidth / 2,
            length = Math.round(tracks) * this.width

        length += destination < currentPosition
            ? this.width - (currentPosition - destination)
            : destination - currentPosition

        if (random)
            length += Math.random() * this.prizeWidth * 0.8 - this.prizeWidth * 0.4

        this.rotate(length)
    }

    rotateByTime(prize: Prize, time: number, random: boolean)
    {
        let v0 = this.acceleration * time
        let l = v0 * v0 / (2 * this.acceleration)
        let tracks = Math.ceil(l / this.width)
        this.rotateByTracks(prize, tracks, random)
    }
}

export default Roulette