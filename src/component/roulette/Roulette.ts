import Prize from "@/component/roulette/Prize"
import {
    ContainerUndefinedException,
    ItemsNotFoundException,
    rotationStartEventName,
    rotationStopEventName,
    rouletteClass,
    rouletteListClass
} from "@/component/roulette/config"

class Roulette {
    private container: any
    private list: HTMLUListElement
    private prizes: Prize[]
    private spacing: number
    private acceleration: number
    private width: number
    private prizeWidth: number
    private audio: null | HTMLAudioElement
    private fps: number
    private rotationTokens: WeakMap<any, any> = new WeakMap()

    constructor(container, options) {
        let {
            spacing = 10,
            acceleration = 350,
            fps = 40,
            audio = "libs/vanillaRoulette/click.wav",
            selector = ":scope > *",
            stopCallback = null,
            startCallback = null
        } = options || {};

        let node: Element|null|undefined =
            typeof container === "string" ?
                document.querySelector(container) :
                container instanceof HTMLElement ?
                    container :
                    container && container[0] instanceof HTMLElement ?
                        container[0] :
                        undefined;

        if (!(node instanceof Element))
            throw ContainerUndefinedException;

        node.classList.add(rouletteClass);

        let list = document.createElement("ul");
        list.classList.add(rouletteListClass);

        let childNodes = [...node.querySelectorAll(selector)];
        if (!childNodes.length)
            throw ItemsNotFoundException;
        let injector = childNodes[0].parentElement
        let maxWidth = Math.max(...childNodes.map(x => x.clientWidth));
        let maxHeight = Math.max(...childNodes.map(x => x.clientHeight));
        let prizes = childNodes.map((el, i) => new Prize(el, i, spacing, maxWidth, maxHeight));
        for (let prize of prizes)
            list.appendChild(prize.wrapper);

        node.style.padding = `${spacing}px`;
        injector.appendChild(list);

        let player = typeof audio === "string" ? new Audio(audio) : audio && audio.play ? audio : null;
        if (player && !player.clone)
            player.clone = player.cloneNode ? player.cloneNode : () => player;

        this.container = node;
        this.list = list;
        this.prizes = prizes;
        this.spacing = spacing;
        this.acceleration = acceleration;
        this.width = (spacing + maxWidth) * prizes.length;
        this.prizeWidth = maxWidth;
        this.audio = player;
        this.fps = fps;
        this.rotationTokens.set(this, -1);

        if (startCallback)
            this.container.addEventListener(rotationStartEventName, startCallback);
        if (stopCallback)
            this.container.addEventListener(rotationStopEventName, stopCallback);
    }

    rotate(pixels = 0) {
        if (this.rotates)
            throw RotationIsAlreadyActiveException;
        if (pixels > 0)
            rotateForward.bind(this)(pixels);
        else if (pixels < 0)
            rotateBackward.bind(this)(pixels);
    }

    rotateTo(block, options) {
        if (this.rotates)
            throw RotationIsAlreadyActiveException;
        let numBlock = Number(block);
        let prize = Number.isNaN(numBlock) ? this.findPrize({ element: block }) : this.findPrize({ index: numBlock });
        if (!prize)
            throw PrizeNotFoundException;
        let { tracks = 0, time = 0, random = true, backward = false } = options || {};
        time |= 0;
        tracks |= 0;
        if (this.selectedPrize.index === prize.index && !time && !tracks)
            return;
        if (time)
            rotateByTime.bind(this)(prize, time, random, backward);
        else
            rotateByTracks.bind(this)(prize, tracks, random, backward);
    }

    playClick() {
        if (this.audio)
        {
            let promise = this.audio.clone().play();
            if (promise && promise.catch)
                promise.catch(() => {});
        }
    }

    findPrize(options) {
        let { index, element } = options || {};
        if ((typeof index !== "number" || Number.isNaN(index)) && !element)
            throw NotEnoughArgumentsException;
        return element ? this.prizes.find(x => x.element === element) : this.prizes[index];
    }

    stop() {
        if (this.rotates) {
            clearInterval(rotationTokens.get(this));
            rotationTokens.set(this, -1);
            this.container.dispatchEvent(new CustomEvent(rotationStopEventName, { detail: { prize: this.selectedPrize } }));
        }
    }

    get selectedPrize() {
        let afterCenterIndex =
            this.prizes.concat()
                .sort((a, b) => a.wrapper.offsetLeft - b.wrapper.offsetLeft)
                .find(prize => prize.wrapper.offsetLeft > this.center).index;
        return this.prizes[(this.prizes.length + afterCenterIndex - 1) % this.prizes.length];
    }

    get firstBlock() {
        return this.findPrize({ element: this.list.querySelector(`:scope > .${roulettePrizeClass} > *`) });
    }

    get lastBlock() {
        let nodes = this.list.querySelectorAll(`:scope > .${roulettePrizeClass} > *`);
        return this.findPrize({ element: nodes[nodes.length - 1] });
    }

    get rotates() {
        return rotationTokens.get(this) > -1;
    }

    get center() {
        return this.list.offsetLeft + this.list.clientWidth / 2;
    }

    static get version() {
        return "1.1.0";
    }
}

export default Roulette