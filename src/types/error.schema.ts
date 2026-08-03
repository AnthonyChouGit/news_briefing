import * as z from "zod";

export const ErrorInfoSchema = z.object({
    err_code: z.coerce.number().int(),
    err_obj: z.unknown()
});

export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

