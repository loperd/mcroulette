export class PrizeNotFoundException extends Error
{
    constructor()
    {
        super("Prize not found")
    }
}