import { Scene } from "./Scene"
import { Vector3 } from "three"

interface Model
{
    getActiveScene(): Scene
    reRender(): this
    render(): void
}

export default Model