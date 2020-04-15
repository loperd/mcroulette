/* eslint-disable */
import { createEventDefinition } from "ts-bus"
import EventName from "./EventName"
import { Chest } from "@/component"
import * as THREE from "three"

const MODEL_LOADED_EVENT = createEventDefinition<{
    models: THREE.Object3D[]|THREE.Mesh[];
    animations: THREE.AnimationClip[];
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