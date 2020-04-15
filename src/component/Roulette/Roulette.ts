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

class Roulette
{
    private readonly _audio: HTMLAudioElement | undefined
    private readonly prizes: Prize[]
    private readonly acceleration: number
    private readonly prizeWidth: number
    private readonly duration: number
    private readonly spacing: number
    private readonly width: number

    private list: ListManager
    private rotationTokens: WeakMap<this, number> = new WeakMap<this, number>()

    constructor(listManager: ListManager, {
        spacing = 10,
        acceleration = 350,
        audio,
        duration = 1000,
        selector = ":scope > *"
    }: {
        acceleration?: number
        spacing?: number
        duration?: number
        audio?: HTMLAudioElement
        selector?: string
    })
    {
        if (duration < 1000)
            throw new UnexpectedErrorException("Error cannot less then 1000")

        const list = listManager.defaultList

        if (!list || !list.classList.contains('roulette__list'))
            throw new UnexpectedErrorException("ul not initialized")

        const childNodes = [...list.querySelectorAll<HTMLLIElement>(selector)]

        if (!childNodes.length)
            throw new ItemsNotFoundException()

        let maxWidth: number = Math.max(...childNodes.map(x => x.offsetWidth))
        let maxHeight: number = Math.max(...childNodes.map(x => x.offsetHeight))

        let prizes: Prize[] = childNodes.map((el: HTMLLIElement, i: number) => {
            const prize: Prize = new Prize(el, i, spacing, maxWidth, maxHeight)
            const key: string = prize.defaultElement.dataset.key || ''

            const link = listManager.backgroundList?.querySelector(`[data-key='${key}']`)

            if (link instanceof HTMLLIElement)
                prize.linkTo(link)

            return prize
        })

        if (audio && !audio["clone"]) {
            audio["clone"] = audio.cloneNode ? audio.cloneNode : () => audio
        }

        this._audio = audio
        this.spacing = spacing
        this.prizes = prizes
        this.list = listManager
        this.duration = duration
        this.acceleration = acceleration
        this.width = (spacing + maxWidth) * prizes.length
        this.prizeWidth = maxWidth
        this.rotationTokens.set(this, -1)

        // if (startCallback)
        //     this.container.addEventListener(rotationStartEventName, startCallback)
        // if (stopCallback)
        //     this.container.addEventListener(rotationStopEventName, stopCallback)
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

        this.rotateByTracks(prize, tracks, random)
    }

    playClick(): void
    {
        try {
            let promise = this.audio["clone"]().play()

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
        if (Number.isNaN(index) && undefined === element)
            throw new NotEnoughArgumentsException()

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
        // this.container.dispatchEvent(new CustomEvent(rotationStopEventName, { detail: { prize: this.selectedPrize } }))
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
        return this.findPrize({ element: this.list.defaultList.querySelector<HTMLLIElement>(`:scope > .${roulettePrizeClass}`) || undefined })
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
        // this.container.dispatchEvent(new CustomEvent(rotationStartEventName, { detail: { prize: this.selectedPrize } }))

        pixels = Math.abs(pixels)

        let starter = Math.abs(Number(this.firstBlock.defaultElement.style.marginLeft.replace("px", "")))

        let
            k = this.acceleration,
            v0 = Math.sqrt(2 * k * pixels),
            totalTime = v0 / k

        let
            halfBlock = this.spacing + this.prizeWidth / 2,
            blockWidth = this.prizeWidth + this.spacing,
            start = performance.now(),
            currentBlock = 0

        const rotate = time => {
            this.rotationTokens.set(this, requestAnimationFrame(rotate))

            let t = (time - start) / this.duration

            if (t > totalTime) {
                this.stop()
                return
            }

            let currentPos = (starter + (v0 * t - k * t * t / 2)) % this.width

            if (Math.floor(currentPos / blockWidth) !== currentBlock) {
                let block = this.firstBlock
                block.marginLeft(0)
                this.list.appendChild(block)
                currentBlock = (currentBlock + 1) % this.prizes.length
            }

            let margin = currentPos % blockWidth

            this.firstBlock.marginLeft(-margin)

            if (margin > halfBlock && !this.isAudioPlaying) {
                this.playClick()
            }
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
}

export default Roulette