import { renderer, container } from "./bootstrap"
import { Circle } from "./assets"
import { Chest } from "./chest"
import "../styles/main.styl"

window.onload = _ => {
    new Circle("circle", .15).draw()

    const chest = container.resolve(Chest)

    chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)

    chest.render()

    console.log(chest.getActiveScene().getScene())

    const rendererEl = renderer.domElement
    rendererEl.setAttribute("id", "case")
    document.body.appendChild(rendererEl)
}