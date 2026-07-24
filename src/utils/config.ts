import dotenv from "dotenv";
import { type Config, ConfigSchema } from "../types/config.schema.js";

export const loadConfig = (config_path: string = ".env"): Config => {
    const raw_config = dotenv.config({ path: config_path }).parsed;
    const config: Config = ConfigSchema.parse(raw_config);
    return config;
}