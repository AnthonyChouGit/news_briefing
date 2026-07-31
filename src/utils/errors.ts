/** Expected error for network failures (timeout, connection refused, HTTP errors). */
export class FetchError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "FetchError";
    }
}

/** Expected error for parsing failures (unexpected HTML structure, invalid JSON). */
export class ParseError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ParseError";
    }
}

export function logExpectedError(error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const d = new Date(Date.now() + 8 * 3600000);
    const dateStr = d.toISOString().replace("Z", "+08:00");
    console.error(`[${dateStr}] Expected Error: ${reason}`);
}
