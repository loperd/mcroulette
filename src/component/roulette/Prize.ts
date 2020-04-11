import { roulettePrizeClass } from "@/component/roulette/config"

class Prize {
    private index: any
    private element: any
    private _wrapper: HTMLLIElement
    constructor(element, index, spacing, width, height) {
        this.index = index;
        this.element = element;

        let wrapper = document.createElement("li");
        wrapper.classList.add(roulettePrizeClass);
        wrapper.style.marginRight = `${spacing}px`;
        wrapper.style.minWidth = `${width}px`;
        wrapper.style.minHeight = `${height}px`;
        wrapper.appendChild(element);

        this._wrapper = wrapper;
    }

    get wrapper(): HTMLLIElement
    {
        return this._wrapper
    }
}

export default Prize