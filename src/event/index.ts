/* eslint-disable */
import { createEventDefinition } from "ts-bus"
import EventName from "./EventName"
import { Chest } from "@/component"
import * as THREE from "three"
import AbstractScene from "@/component/Chest/Scene/AbstractScene"

export const MODEL_LOADED_EVENT = createEventDefinition<{
    models: THREE.Object3D[]|THREE.Mesh[];
    animations: THREE.AnimationClip[];
}>()(EventName.MODEL_LOADED)

export const SCENE_LOADED_EVENT = createEventDefinition<{
    scene: AbstractScene;
}>()(EventName.SCENE_LOADED)

export const CHEST_OPENED_EVENT = createEventDefinition<{
    chest: Chest;
}>()(EventName.CHEST_OPENED)

export const CHEST_OPEN_EVENT = createEventDefinition()(EventName.CHEST_OPEN)

export { EventName }