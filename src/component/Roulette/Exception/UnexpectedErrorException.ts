export default class UnexpectedErrorException extends Error {
    constructor(message?: string)
    {
        super(message || 'Unexpected error');
    }
}