import { run } from "./run.js";
import { loadConfig, type Config } from "./utils/config.js";
import { join } from "node:path";

const config: Config = loadConfig(process.env.CONFIG_PATH ?? join(import.meta.dirname, ".env"));

await run(config);