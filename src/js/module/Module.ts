import Scene from "./scene/Scene"
import { Vector3 } from "three"

interface Module
{
    changePosition(position: Vector3): this;
    rotate(position: Vector3): this;
    getActiveScene(): Scene;
}

export default Module