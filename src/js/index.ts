import { bus, camera, loader, renderer } from "./bootstrap"
import { CHEST_OPENED_EVENT } from "./event"
import { Circle } from "./component"
import { Chest } from "./chest"
import "../styles/main.styl"

window.onload = async () =>
{
    new Circle("circle", .15).draw()

    const chest = new Chest(camera, renderer, loader, bus)
    await chest.loadModel(Chest.DEFAULT_MODEL_FILENAME)

    chest.swapActiveScene()
    chest.play()


    bus.subscribe(CHEST_OPENED_EVENT, _ => console.log('Chest opened'))

    setTimeout(_ => {
        chest.swapActiveScene()

        chest.open()
    }, 5000)


    setTimeout(_ => {
        chest.reset().swapActiveScene()

        setTimeout(_ => {
            chest.swapActiveScene()

            chest.open()
        }, 5000)
    }, 15000)

    // await delay(5000, _ => chest.reset())

    const rendererEl = renderer.domElement
    rendererEl.setAttribute("id", "case")
    document.body.appendChild(rendererEl)
}