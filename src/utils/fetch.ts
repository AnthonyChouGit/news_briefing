import { type Piscina } from "piscina";
import { BriefNews, type NewsCategory } from "../types/brief_news.entity.js";
// import { FetchError, logExpectedError } from "./errors.js";
import { type FetchOptions, FetchOptionsSchema } from "../types/config.schema.js";

export class NewsFetcher {
    private readonly categories: NewsCategory[];
    private readonly pool: Piscina;
    private readonly fetchOptions: FetchOptions;
    constructor(
        categories: NewsCategory[],
        pool: Piscina,
        fetchOptions: FetchOptions = {}
    ) {
        this.categories = categories;
        this.pool = pool;
        this.fetchOptions = FetchOptionsSchema.parse(fetchOptions);
    }

    public async fetch(): Promise<Map<NewsCategory, Map<string, BriefNews>>> {
        const tasks = this.categories.map((category: NewsCategory) =>
            this.pool.run({ category, options: this.fetchOptions },
                { name: 'fetchNewsByCategory', filename: new URL('./_fetch.js', import.meta.url).href })
        );

        const results = await Promise.allSettled(tasks);
        const all_categories = new Map<NewsCategory, Map<string, BriefNews>>();

        for (let i = 0; i < this.categories.length; i++) {
            const result = results[i]!;
            const category: NewsCategory = this.categories[i]!;

            if (result.status === 'rejected') {
                // logExpectedError(new FetchError(`[Fetch] Failed to fetch news for category: ${category} due to ${result.reason}`));
                // continue;
                throw result.reason;
            }

            const category_items: Map<string, BriefNews> = result.value;
            all_categories.set(category, category_items);
        }
        return all_categories;
    }
}

