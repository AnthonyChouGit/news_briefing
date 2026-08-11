import * as z from "zod";

export const ErrorInfoSchema = z.object({
    err_code: z.coerce.number().int(),
    err_obj: z.unknown()
});

export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

export function logExpectedError(error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const d = new Date(Date.now() + 8 * 3600000);
    const dateStr = d.toISOString().replace("Z", "+08:00");
    console.error(`[${dateStr}] Expected Error: ${reason}`);
}
