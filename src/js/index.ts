import { camera, loader, renderer } from "./bootstrap"
import { Circle } from "./assets"
import { Chest } from "./chest"
import "../styles/main.styl"

window.onload = _ => {
    new Circle("circle", .15).draw()

    const chest = new Chest(camera, renderer, loader)
    chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)

    const rendererEl = renderer.domElement
    rendererEl.setAttribute("id", "case")
    document.body.appendChild(rendererEl)
}