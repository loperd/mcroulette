export class NotEnoughArgumentsException extends Error
{
    constructor()
    {
        super("Not enough arguments")
    }
}