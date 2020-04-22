/* eslint-disable */
import Prize from "@/component/Roulette/Prize"
import { roulettePrizeClass } from "@/component/Roulette/config"
import {
    ItemsNotFoundException,
    NotEnoughArgumentsException,
    PrizeNotFoundException,
    RotationIsAlreadyActiveException,
} from "./Exception"
import UnexpectedErrorException from "@/component/Roulette/Exception/UnexpectedErrorException"
import ListManager from "@/component/Roulette/ListManager"
import { EventBus } from "ts-bus"
import { ROULETTE_START_EVENT, ROULETTE_STOPPED_EVENT } from "@/event"

class Roulette
{
    private readonly _audio: HTMLAudioElement | undefined
    private readonly prizes: Prize[]
    private readonly acceleration: number
    private readonly prizeWidth: number
    private readonly duration: number
    private readonly spacing: number
    private readonly width: number

    private bus: EventBus
    private list: ListManager
    private rotationTokens: WeakMap<this, number> = new WeakMap<this, number>()

    constructor(listManager: ListManager, {
        spacing = 10,
        acceleration = 350,
        audio,
        duration = 1000,
        selector = ":scope > div",
        bus
    }: {
        bus: EventBus
        acceleration?: number
        spacing?: number
        duration?: number
        audio?: HTMLAudioElement
        selector?: string
    })
    {
        this.list = listManager
        this.spacing = spacing

        if (duration < 1000)
            throw new UnexpectedErrorException("Error cannot less then 1000")

        const node: (Node & ParentNode) = <(Node & ParentNode)>listManager.defaultList.parentNode

        const childNodes = [...node.querySelectorAll<HTMLLIElement>(selector)]

        this.bus = bus

        if (!childNodes.length)
            throw new ItemsNotFoundException()

        let maxWidth: number = Math.max(...childNodes.map(x => x.offsetWidth))
        let maxHeight: number = Math.max(...childNodes.map(x => x.offsetHeight))

        let prizes: Prize[] = this.createPrizes(childNodes, maxWidth, maxHeight)

        if (audio && !audio["clone"]) {
            audio["clone"] = audio.cloneNode ? audio.cloneNode : () => audio
        }

        this._audio = audio
        this.prizes = prizes
        this.duration = duration
        this.acceleration = acceleration
        this.width = (spacing + maxWidth) * prizes.length
        this.prizeWidth = maxWidth
        this.rotationTokens.set(this, -1)
    }


    public get audio(): HTMLAudioElement
    {
        if (undefined === this._audio)
            throw new UnexpectedErrorException('Audio was not initialised')

        return this._audio
    }

    public isAudioPlaying(): boolean
    {
        try {
            return this.audio.duration > 0 && !this.audio.paused
        } catch (e) {
            return true
        }
    }

    rotate(pixels: number = 0): void
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        if (pixels < 0)
            throw new NotEnoughArgumentsException()

        this.rotateForward(pixels)
    }

    public rotateTo(block: HTMLElement | number, { tracks = 0, time = 0, random = true }: {
        tracks?: number
        time?: number
        random?: boolean
    }): void
    {
        if (this.rotates)
            throw new RotationIsAlreadyActiveException()

        let numBlock = Number(block)
        let prize = Number.isNaN(numBlock)
            ? this.findPrize({ element: <HTMLLIElement>block })
            : this.findPrize({ index: numBlock })

        if (this.selectedPrize.index === prize.index && !time && !tracks)
            return

        if (time) {
            this.rotateByTime(prize, time, random)
            return
        }

        setTimeout(() => this.rotateByTracks(prize, tracks, random), 200)
    }

    playClick(): void
    {
        if (this.isAudioPlaying())
            return

        try {

            const audio = this.audio["clone"]()

            audio.volume = .05

            let promise = audio.play()

            if (promise && promise.catch)
                promise.catch(e => e)
        } catch (e) {
            console.log(e)
        }
    }

    public findPrize({ element, index = NaN }: {
        element?: HTMLLIElement
        index?: number
    }): Prize
    {
        if (Number.isNaN(index) && undefined === element) {
            console.log(arguments)
            throw new NotEnoughArgumentsException()
        }

        if (index > 0) {
            return this.prizes[index - 1]
        }

        const result = this.prizes.find(x => x.defaultElement === element)

        if (undefined === result)
            throw new PrizeNotFoundException()

        return result
    }

    public stop(): void
    {
        if (!this.rotates) {
            return
        }

        cancelAnimationFrame(<number>this.rotationTokens.get(this))

        this.rotationTokens.set(this, -1)

        setTimeout(() => this.bus.publish(ROULETTE_STOPPED_EVENT({ prize: this.selectedPrize })), 1200)
    }

    get selectedPrize()
    {
        let afterCenterIndex = this.prizes.concat()
            .sort((a, b) => a.defaultElement.offsetLeft - b.defaultElement.offsetLeft)
            .find(prize => prize.defaultElement.offsetLeft > this.center)?.index

        if (afterCenterIndex === undefined)
            throw new UnexpectedErrorException("Can not find afterCenterIndex")

        return this.prizes[(this.prizes.length + afterCenterIndex - 1) % this.prizes.length]
    }

    get firstBlock(): Prize
    {
        const element = this.list.defaultList.querySelector<HTMLLIElement>(`:scope > .${roulettePrizeClass}`)

        return this.findPrize({ element: element || undefined })
    }

    get rotates(): boolean
    {
        return (this.rotationTokens.get(this) || -1) > -1
    }

    get center(): number
    {
        return this.list.offsetLeft + window.innerWidth / 2
    }

    rotateForward(pixels: number): void
    {
        this.bus.publish(ROULETTE_START_EVENT({ prize: this.selectedPrize }))

        pixels = Math.abs(pixels)

        let starter = Math.abs(Number(this.firstBlock.defaultElement.style.marginLeft.replace("px", "")))

        let
            k = this.acceleration,
            v0 = Math.sqrt(2 * k * pixels),
            totalTime = v0 / k

        let
            blockWidth = this.prizeWidth + this.spacing,
            start = performance.now(),
            currentBlock = 0

        const rotate = time => {
            this.rotationTokens.set(this, requestAnimationFrame(rotate))

            let t = (time - start) / this.duration

            if (t > totalTime)
                return this.stop()

            let currentPos = (starter + (v0 * t - k * t * t / 2)) % this.width
            let margin = currentPos % blockWidth

            if (Math.floor(currentPos / blockWidth) === currentBlock)
                return this.firstBlock.marginLeft(-margin)

            this.firstBlock.marginLeft(0)
            this.list.appendChild(this.firstBlock)

            currentBlock = (currentBlock + 1) % this.prizes.length

            this.playClick()
        }

        requestAnimationFrame(rotate)
    }

    rotateByTracks(prize: Prize, tracks: number, random: boolean): void
    {
        const
            blockWidth = this.prizeWidth + this.spacing,
            currentBlock = this.selectedPrize

        let
            currentPosition = currentBlock.index * blockWidth + (this.center - currentBlock.defaultElement.offsetLeft),
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

    private createPrizes(childNodes: HTMLLIElement[], width, height): Prize[]
    {
        return childNodes.map((el: HTMLLIElement, i: number) => {
            const key: string = el.dataset.key || ''

            if (key === '')
                throw new UnexpectedErrorException(`Key was not set for item #${i}`)

            let wrapper = document.createElement("li");
            wrapper.classList.add(roulettePrizeClass)
            wrapper.style.marginRight = `${this.spacing}px`
            wrapper.style.minHeight = `${height}px`
            wrapper.style.minWidth = `${width}px`
            wrapper.appendChild(el)

            const prize: Prize = new Prize(key, i)

            this.list.addChild(wrapper, prize)

            return prize
        })
    }
}

export default Roulette