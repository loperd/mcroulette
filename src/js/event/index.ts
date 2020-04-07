import { createEventDefinition } from "ts-bus"
import EventName from "./EventName"
import { AnimationClip, Mesh, Object3D } from "three"

const modelLoaded = createEventDefinition<{
    models: Object3D[]|Mesh[];
    animations: AnimationClip[];
}>()(EventName.LOADED_MODEL)

export {
    EventName,
    modelLoaded
}