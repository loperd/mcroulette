import { Scene } from "./index"

interface PhysicalScene extends Scene
{
    setupGround(): this
}

export default PhysicalScene