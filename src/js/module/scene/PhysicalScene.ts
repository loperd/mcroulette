import Scene from "./Scene"

interface PhysicalScene extends Scene
{
    setupGround(): this
}

export default PhysicalScene