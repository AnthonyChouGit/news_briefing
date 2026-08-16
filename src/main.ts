import { run } from "./run.js";
import { loadConfig, type Config } from "./utils/config.js";

const config: Config = loadConfig(process.env.CONFIG_PATH);

await run(config);