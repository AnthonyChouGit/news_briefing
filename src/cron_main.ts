import { run } from "./run.js";
import { loadConfig, type Config } from "./utils/config.js";
import { CronJob } from "cron";

const config: Config = loadConfig(process.env.CONFIG_PATH);
if (!config.cron_expr)
    throw Error("cron_expr is not set");
const cron_job = CronJob.from({
    cronTime: config.cron_expr,
    onTick: async () => {
        try {
            await run(config);
        } catch (err) {
            console.error("[Cron] News briefing execution failed:", err);
        }
    },
    ...(config.time_zone ? { timeZone: config.time_zone } : {})
});
cron_job.start();