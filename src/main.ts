import { ExecutionContext, type InitData } from "./utils/context.js";
import { loadConfig, type Config } from "./utils/config.js";
import { join } from "node:path";
import { news_briefing_dag } from "./news_briefing.dag.js";

const config: Config = loadConfig(process.env.CONFIG_PATH ?? join(import.meta.dirname, "test.env"));

const execution_context = new ExecutionContext(config);

process.on("SIGTERM", async () => {
    console.warn("[Main] SIGTERM received");
    await execution_context.cleanUp();
    process.exit(1);
});

process.on("SIGINT", async () => {
    console.warn("[Main] SIGINT received");
    await execution_context.cleanUp();
    process.exit(1);
});

try {
    const initData: InitData = await execution_context.init();
    const { inputs, context, options, pool } = initData;
    news_briefing_dag.setDebug(true);
    news_briefing_dag.setTimeout(900000);
    const output_values = await news_briefing_dag.run(inputs, ["success"], context, options, pool);
    if (output_values.success)
        console.log("[Main] News briefing completed successfully");
    else
        console.error("[Main] News briefing failed");
} catch (e) {
    console.error("[Main] News briefing failed", e);
} finally {
    await execution_context.cleanUp();
}