export class ItemsNotFoundException extends Error
{
    constructor()
    {
        super("Items not found")
    }
}