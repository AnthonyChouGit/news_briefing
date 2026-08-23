import { type Config } from "./config.js";
import { DataSource, Repository } from "typeorm";
import { Piscina } from "piscina";
import { GrammyTelegramClient } from "./telegram.js";
import { BriefNews } from "../types/brief_news.entity.js";
import { OpenAIClient, AISDKClient, AIClient } from "./ai.js";
import { TelegramErrorHandler } from "./error.js";

export interface InitData {
    inputs: Record<string, unknown>,
    context: Record<string, unknown>,
    options: Record<string, unknown>,
    pool: Piscina
}

export class ExecutionContext {
    private readonly data_source: DataSource;
    private readonly ai_client: AIClient;
    private readonly thread_pool: Piscina;
    private readonly send_client: GrammyTelegramClient;
    private readonly repository: Repository<BriefNews>;
    private readonly config: Config;
    private readonly error_handler: TelegramErrorHandler;

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

        // this.ai_client = new OpenAIClient(config);
        this.ai_client = config.ai_provider_type === 'openai-compatible' ? new OpenAIClient(config) : new AISDKClient(config);

        this.thread_pool = new Piscina();

        this.send_client = new GrammyTelegramClient(config);

        this.config = config;

        this.error_handler = new TelegramErrorHandler(this.send_client, config.error_channels);
    }

    public async init(): Promise<InitData> {
        await this.data_source.initialize();
        const context = {
            thread_pool: this.thread_pool,
            repository: this.repository,
            ai_client: this.ai_client,
            send_client: this.send_client,
            error_handler: this.error_handler
        };
        const options = this.config;
        const inputs = {
            categories: this.config.categories,
            channels: this.config.channels
        };
        return { inputs, context, options, pool: this.thread_pool };
    }

    public async cleanUp() {
        if (this.data_source.isInitialized)
            await this.data_source.destroy();
        if (this.thread_pool)
            await this.thread_pool.destroy();
    }
}