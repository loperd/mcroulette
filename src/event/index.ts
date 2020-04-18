/* eslint-disable */
import AbstractScene from "@/component/Chest/Scene/AbstractScene"
import { createEventDefinition } from "ts-bus"
import Prize from "@/component/Roulette/Prize"
import EventName from "./EventName"
import { Chest } from "@/component"
import * as THREE from "three"

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

export const ROULETTE_START_EVENT = createEventDefinition<{
    prize: Prize;
}>()(EventName.ROULETTE_START)

export const ROULETTE_STOPPED_EVENT = createEventDefinition<{
    prize: Prize;
}>()(EventName.ROULETTE_STOPPED)

export const CLOSE_WIN_SCREEN_EVENT = createEventDefinition()(EventName.CLOSE_WIN_SCREEN)

export const CHEST_OPEN_EVENT = createEventDefinition()(EventName.CHEST_OPEN)

export { EventName }