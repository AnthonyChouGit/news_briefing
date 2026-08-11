import { type Config } from "../types/config.schema.js";
import { DataSource, Repository } from "typeorm";
import { Piscina } from "piscina";
import { GrammyTelegramClient } from "./telegram.js";
import { BriefNews } from "../types/brief_news.entity.js";
import { OpenAIClient } from "./ai.js";

export class ExecutionContext {
    private readonly data_source: DataSource;
    private readonly ai_client: OpenAIClient;
    private readonly thread_pool: Piscina;
    private readonly send_client: GrammyTelegramClient;
    private readonly repository: Repository<BriefNews>;
    private readonly config: Config;

    constructor(config: Config) {
        this.data_source = new DataSource({
            type: "postgres",
            host: config.database_host,
            port: config.database_port,
            username: config.database_user,
            password: config.database_password,
            database: config.database_name,
            entities: [BriefNews]
        });
        this.repository = this.data_source.getRepository(BriefNews);

        this.ai_client = new OpenAIClient(config);

        this.thread_pool = new Piscina();

        this.send_client = new GrammyTelegramClient(config);

        this.config = config;
    }

    public async init(): Promise<{ inputs: Record<string, unknown>, context: Record<string, unknown>, options: Record<string, unknown> }> {
        await this.data_source.initialize();
        const context = {
            thread_pool: this.thread_pool,
            repository: this.repository,
            ai_client: this.ai_client,
            send_client: this.send_client,
        };
        const options = {
            timeout: this.config.timeout,
            maxDecodeItems: this.config.maxDecodeItems,
            userAgent: this.config.userAgent,
            time_window_days: this.config.time_window_days,
            max_items_per_category: this.config.max_items_per_category,
            maxBodyChars: this.config.maxBodyChars,
            concurrency: this.config.concurrency,
            language: this.config.language,
            parse_mode: this.config.parse_mode,
        };
        const inputs = {
            categories: this.config.categories,
            channels: this.config.channels
        };
        return { inputs, context, options };
    }

    public async cleanUp() {
        await this.data_source.destroy();
        await this.thread_pool.destroy();
    }
}