export class Item {
    public id: string
    public title: string
    public image: string
    public type: string
    public chance: number

    constructor({ id, title, image, type, chance }: {
        id: string,
        title: string,
        image: string,
        type: string,
        chance: number
    }) {
        this.id = id.toString()
        this.title = title
        this.image = image
        this.type = type
        this.chance = chance
    }
}