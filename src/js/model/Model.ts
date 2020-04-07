import { Scene } from "./Scene"
import { Vector3 } from "three"

interface Model
{
    getActiveScene(): Scene
    reRender(): this
    render(): this
}

export default Model