import { type Config } from "../types/config.schema.js";
import { DataSource, Repository } from "typeorm";
import { NewsFetcher } from "./fetch.js";
import { NewsReader } from "./read.js";
import { EventDeduplicator } from "./dedupe.js";
import { NewsSummarizer } from "./summarize.js";
import { TypeOrmNewsHistory } from "./history.js";
import { Piscina } from "piscina";
import { TelegramNewsFormatMD } from "./format.js";
import { GrammyTelegramClient } from "./telegram.js";
import { BriefNews } from "../types/brief_news.entity.js";
import { OpenAIClient } from "./ai.js";

export class ExecutionContext {
    private readonly data_source: DataSource;
    private readonly ai_client: OpenAIClient;
    private readonly news_fetcher: NewsFetcher;
    private readonly news_reader: NewsReader;
    private readonly news_history: TypeOrmNewsHistory;
    private readonly news_deduplicator: EventDeduplicator;
    private readonly news_summarizer: NewsSummarizer;
    private readonly thread_pool: Piscina;
    private readonly news_format: TelegramNewsFormatMD;
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
        this.news_history = new TypeOrmNewsHistory();
        this.ai_client = new OpenAIClient(config);
        this.news_fetcher = new NewsFetcher();
        this.news_reader = new NewsReader();
        this.news_deduplicator = new EventDeduplicator();
        this.news_summarizer = new NewsSummarizer();
        this.thread_pool = new Piscina();
        this.news_format = new TelegramNewsFormatMD();
        this.send_client = new GrammyTelegramClient(config);

        this.config = config;
    }

    public async init(): Promise<{ context: Record<string, unknown>, options: Record<string, unknown> }> {
        await this.data_source.initialize();
        const context = {
            news_fetcher: this.news_fetcher,
            thread_pool: this.thread_pool,
            data_src: this.repository,
            history_fetcher: this.news_history,
            history_saver: this.news_history,
            deduplicator: this.news_deduplicator,
            ai_client: this.ai_client,
            news_reader: this.news_reader,
            news_summarizer: this.news_summarizer,
            news_formatter: this.news_format,
            send_client: this.send_client,
        }
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
        }
        return { context, options };
    }

    public async cleanUp() {
        await this.data_source.destroy();
        await this.thread_pool.destroy();
    }
}