import { createEventDefinition } from "ts-bus"
import EventName from "./EventName"
import { AnimationClip, Mesh, Object3D } from "three"
import Chest from "../chest/Chest"

const MODEL_LOADED_EVENT = createEventDefinition<{
    models: Object3D[]|Mesh[];
    animations: AnimationClip[];
}>()(EventName.MODEL_LOADED)

const CHEST_OPENED_EVENT = createEventDefinition<{
    chest: Chest;
}>()(EventName.CHEST_OPENED)

const CHEST_OPEN_EVENT = createEventDefinition<{
    chest: Chest;
}>()(EventName.CHEST_OPEN)

export {
    EventName,
    MODEL_LOADED_EVENT,
    CHEST_OPENED_EVENT,
    CHEST_OPEN_EVENT
}