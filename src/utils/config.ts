import dotenv from "dotenv";
import { ConfigSchema, type Config } from "../types/config.schema.js";

export const loadConfig = (config_path: string = ".env"): Config => {
    const result = dotenv.config({ path: config_path });
    if (result.error || !result.parsed)
        throw result.error;
    const config: Config = ConfigSchema.parse(result.parsed);
    return config;
}