import * as z from "zod";

export const ConfigSchema = z.object({
    database_host: z.string().nonempty().default("localhost"),
    database_port: z.coerce.number().int().positive().default(5432),
    database_user: z.string().nonempty().default("root"),
    database_password: z.string().default(""),
    database_name: z.string().nonempty().default("db_dev")
}).default({} as any);

export type Config = z.infer<typeof ConfigSchema>;