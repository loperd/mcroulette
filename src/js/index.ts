import { bus, camera, loader, renderer } from "./bootstrap"
import { Circle } from "./assets"
import { Chest } from "./chest"
import "../styles/main.styl"
import { defer, delay, wait } from "./model/helper"

window.onload = async () =>
{
    new Circle("circle", .15).draw()

    const chest = new Chest(camera, renderer, loader, bus)
    await chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)

    chest.swapActiveScene()
    await chest.render()

    setTimeout(async _ => {
        chest.swapActiveScene()
        chest.reRender()

        await chest.open(_ => console.log('Chest opened'))
    }, 5000)

    // await delay(5000, _ => chest.reset())

    const rendererEl = renderer.domElement
    rendererEl.setAttribute("id", "case")
    document.body.appendChild(rendererEl)
}