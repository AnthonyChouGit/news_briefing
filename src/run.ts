import { ExecutionContext, type InitData } from "./utils/context.js";
import { type Config } from "./utils/config.js";
import { news_briefing_dag } from "./news_briefing.dag.js";

export const run = async (config: Config) => {

    const execution_context = new ExecutionContext(config);

    const onTermination = async () => {
        console.warn("[Main] Termination signal received");
        await execution_context.cleanUp();
        process.exit(1);
    };

    process.once("SIGTERM", onTermination);
    process.once("SIGINT", onTermination);

    try {
        const initData: InitData = await execution_context.init();
        const { inputs, context, options, pool } = initData;
        if (config.debug)
            news_briefing_dag.setDebug(true);
        if (config.dag_timeout)
            news_briefing_dag.setTimeout(config.dag_timeout);
        const output_values = await news_briefing_dag.run(inputs, ["success"], context, options, pool);
        if (output_values.success)
            console.log("[Main] News briefing completed successfully");
        else
            console.error("[Main] News briefing failed");
    } catch (e) {
        console.error("[Main] News briefing failed", e);
    } finally {
        process.off("SIGTERM", onTermination);
        process.off("SIGINT", onTermination);
        await execution_context.cleanUp();
    }
}