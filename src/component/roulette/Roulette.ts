import Prize from "@/component/roulette/Prize"
import {
    rotationStartEventName,
    rotationStopEventName,
    rouletteClass,
    rouletteListClass, roulettePrizeClass
} from "@/component/roulette/config"

import {
    RotationIsAlreadyActiveException,
    ContainerUndefinedException,
    NotEnoughArgumentsException,
    ItemsNotFoundException,
    NotImplementedException,
    PrizeNotFoundException,
} from "./Exception"

class Roulette
{
    private readonly audio: null | HTMLAudioElement
    private readonly prizes: Prize[]

    private rotationTokens: WeakMap<this, any> = new WeakMap()
    private list: HTMLUListElement
    private readonly acceleration: number
    private readonly prizeWidth: number
    private readonly spacing: number
    private readonly width: number
    private readonly fps: number
    private container: Element

    constructor(container: string, options: {
        startCallback: () => any
        stopCallback: () => any
        acceleration: number
        spacing: number
        fps: number
        audio: string
        selector: string
    })
    {
        let {
            spacing = 10,
            acceleration = 350,
            fps = 40,
            audio = "libs/vanillaRoulette/click.wav",
            selector = ":scope > *",
            stopCallback = null,
            startCallback = null
        } = options || {}

        let node: null | Element = document.querySelector(container)

        if (!(node instanceof Element))
            throw new ContainerUndefinedException()

        node.classList.add(rouletteClass)

        let list = document.createElement("ul")
        list.classList.add(rouletteListClass)

        let childNodes = [...node.querySelectorAll(selector)]
        if (!childNodes.length)
            throw new ItemsNotFoundException

        let injector = childNodes[0].parentElement
        let maxWidth = Math.max(...childNodes.map(x => x.clientWidth))
        let maxHeight = Math.max(...childNodes.map(x => x.clientHeight))
        let prizes = childNodes.map((el, i) => new Prize(el, i, spacing, maxWidth, maxHeight))

        for (let prize of prizes)
            list.appendChild(prize.wrapper)

        node["style"].padding = `${spacing}px`
        injector?.appendChild(list)

        let player = new Audio(audio)

        if (player && !player["clone"])
            player["clone"] = player.cloneNode ? player.cloneNode : () => player

        this.container = node
        this.list = list
        this.prizes = prizes
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

    rotate(pixels = 0)
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        if (pixels < 0)
            throw new NotImplementedException()

        this.rotateForward(pixels)
    }

    public rotateTo(block: Element|number, options)
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        let numBlock = Number(block)
        let prize = Number.isNaN(numBlock)
            ? this.findPrize({ element: <Element>block })
            : this.findPrize({ index: numBlock })

        let { tracks = 0, time = 0, random = true } = options || {}
        time |= 0
        tracks |= 0

        if (this.selectedPrize.index === prize.index && !time && !tracks)
            return

        if (time) {
            this.rotateByTime(prize, time, random)
            return
        }

        this.rotateByTracks(prize, tracks, random)
    }

    playClick()
    {
        if (this.audio) {
            let promise = this.audio["clone"]().play()
            if (promise && promise.catch)
                promise.catch(() => {
                })
        }
    }

    public findPrize({ element, index = NaN }: {
        element?: Element
        index?: number
    }): Prize
    {
        if (Number.isNaN(index) && undefined === element)
            throw new NotEnoughArgumentsException()

        if (index > 0) {
            return this.prizes[index];
        }

        const result = this.prizes.find(x => x.element === element)

        if (undefined === result)
            throw new PrizeNotFoundException()

        return result
    }

    public stop(): void
    {
        if (this.rotates) {
            clearInterval(this.rotationTokens.get(this))
            this.rotationTokens.set(this, -1)
            this.container.dispatchEvent(new CustomEvent(rotationStopEventName, { detail: { prize: this.selectedPrize } }))
        }
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

    get rotates()
    {
        return this.rotationTokens.get(this) > -1
    }

    get center()
    {
        return this.list.offsetLeft + this.list.clientWidth / 2
    }

    static get version()
    {
        return "1.1.0"
    }

    rotateForward(pixels)
    {
        this.container.dispatchEvent(new CustomEvent(rotationStartEventName, { detail: { prize: this.selectedPrize } }))

        pixels = Math.abs(pixels)
        let starter = Math.abs(Number(this.firstBlock.wrapper.style.marginLeft.replace("px", "")))

        let k = this.acceleration
        let v0 = Math.sqrt(2 * k * pixels)
        let totalTime = v0 / k

        let intervalMS = 1000 / this.fps
        let intervalS = intervalMS / 1000

        let blockWidth = this.prizeWidth + this.spacing
        let t = 0
        let currentBlock = 0
        let played = false
        let halfBlock = this.spacing + this.prizeWidth / 2

        let token = setInterval(() => {

            if (t > totalTime) {
                this.stop()
                return
            }

            let currentPos = (starter + (v0 * t - k * t * t / 2)) % this.width

            if (Math.floor(currentPos / blockWidth) != currentBlock) {
                let block = this.firstBlock
                this.list.appendChild(block.wrapper)
                block.wrapper.style.marginLeft = "0px"
                currentBlock = (currentBlock + 1) % this.prizes.length
                played = false
            }
            let margin = currentPos % blockWidth
            this.firstBlock.wrapper.style.marginLeft = `-${margin}px`
            if (margin > halfBlock && !played) {
                played = true
                this.playClick()
            }

            t += intervalS

        }, intervalMS)

        this.rotationTokens.set(this, token)
    }

    rotateByTracks(prize: Prize, tracks: number, random: boolean)
    {
        const blockWidth = this.prizeWidth + this.spacing
        let currentBlock = this.selectedPrize
        let length = Math.round(tracks) * this.width
        let currentPosition = currentBlock.index * blockWidth + (this.center - currentBlock.wrapper.offsetLeft)
        let destination = prize.index * blockWidth + this.spacing + this.prizeWidth / 2

        length += destination < currentPosition
            ? this.width - (currentPosition - destination)
            : destination - currentPosition

        if (random)
            length += Math.random() * this.prizeWidth * 0.8 - this.prizeWidth * 0.4

        this.rotate(length)
    }

    rotateByTime(prize: Prize, time: number, random)
    {
        let v0 = this.acceleration * time
        let l = v0 * v0 / (2 * this.acceleration)
        let tracks = Math.ceil(l / this.width)
        this.rotateByTracks(prize, tracks, random)
    }
}

export default Roulette