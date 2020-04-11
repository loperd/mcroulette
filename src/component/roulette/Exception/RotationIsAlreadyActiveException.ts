export class RotationIsAlreadyActiveException extends Error
{
    constructor()
    {
        super("Rotation is already active")
    }
}