import { type Piscina } from "piscina";
import { type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { type FetchOptions } from "../types/config.schema.js";

export class NewsFetcher {
    public async fetch(categories: NewsCategory[], pool: Piscina, fetchOptions: FetchOptions): Promise<Map<NewsCategory, Map<string, BriefNewsLike>>> {
        if (categories.length === 0) {
            throw new Error("Categories array cannot be empty.");
        }

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
                console.error(`\n🚨🚨🚨 [FETCH ERROR] Failed to fetch category "${category}" 🚨🚨🚨`);
                console.error(result.reason);
                console.error(`=========================================================\n`);
                continue;
            }

            const category_items: Map<string, BriefNewsLike> = result.value;
            all_categories.set(category, category_items);
        }

        if (all_categories.size === 0) {
            throw new Error("All categories failed to fetch.");
        }

        return all_categories;
    }
}

