// converts input to degree
export function d(input: number): number
{
    return input * Math.PI / 180
}

export async function wait(ms: number): Promise<any>
{
    return new Promise(resolve => setTimeout(_ => _, ms))
}

export async function defer(ms: number, callback: (_?) => any): Promise<any>
{
    return new Promise(resolve => setTimeout(_ => resolve(callback()), ms));
}

export async function delay(ms: number, callback: (_?) => any): Promise<any>
{
    return await new Promise(resolve => setTimeout(_ => resolve(callback()), ms));
}