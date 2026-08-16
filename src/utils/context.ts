import { type Config } from "./config.js";
import { DataSource, Repository } from "typeorm";
import { Piscina } from "piscina";
import { GrammyTelegramClient } from "./telegram.js";
import { BriefNews } from "../types/brief_news.entity.js";
import { OpenAIClient } from "./ai.js";
import { TelegramErrorHandler } from "./error.js";

export interface InitData {
    inputs: Record<string, unknown>,
    context: Record<string, unknown>,
    options: Record<string, unknown>,
    pool: Piscina
}

export class ExecutionContext {
    private readonly data_source: DataSource;
    private readonly ai_client: OpenAIClient;
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

        this.ai_client = new OpenAIClient(config);

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
        const options = {
            fetch_timeout: this.config.fetch_timeout,
            fetch_max_decode_items: this.config.fetch_max_decode_items,
            fetch_user_agent: this.config.fetch_user_agent,
            read_timeout: this.config.read_timeout,
            read_user_agent: this.config.read_user_agent,
            read_max_body_chars: this.config.read_max_body_chars,
            read_concurrency: this.config.read_concurrency,
            history_time_window_days: this.config.history_time_window_days,
            truncate_max_items_per_category: this.config.truncate_max_items_per_category,
            language: this.config.language,
            time_zone: this.config.time_zone,
            send_parse_mode: this.config.send_parse_mode,
            send_chunk_size: this.config.send_chunk_size,
            debug: this.config.debug,
            filter_recency_td_hours: this.config.filter_recency_td_hours,
        };
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