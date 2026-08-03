import { type Piscina } from "piscina";
import { type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
// import { FetchError, logExpectedError } from "./errors.js";
import { type FetchOptions, FetchOptionsSchema } from "../types/config.schema.js";

export class NewsFetcher {
    public async fetch(categories: NewsCategory[], pool: Piscina, fetchOptions: FetchOptions): Promise<Map<NewsCategory, Map<string, BriefNewsLike>>> {
        const tasks = categories.map((category: NewsCategory) =>
            pool.run({ category, options: fetchOptions },
                { name: 'fetchNewsByCategory', filename: new URL('./_fetch.js', import.meta.url).href })
        );

        const results = await Promise.allSettled(tasks);
        const all_categories = new Map<NewsCategory, Map<string, BriefNewsLike>>();

        for (let i = 0; i < categories.length; i++) {
            const result = results[i]!;
            const category: NewsCategory = categories[i]!;

            if (result.status === 'rejected') {
                // logExpectedError(new FetchError(`[Fetch] Failed to fetch news for category: ${category} due to ${result.reason}`));
                // continue;
                throw result.reason;
            }

            const category_items: Map<string, BriefNewsLike> = result.value;
            all_categories.set(category, category_items);
        }
        return all_categories;
    }
}

