// converts input to degree
export function d(input: number): number
{
    return input * Math.PI / 180
}

export function randomInt(min: number, max: number): number
{
    return Math.floor(min + Math.random() * (max + 1 - min))
}