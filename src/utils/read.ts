import { type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { type ReadOptions } from "../types/config.schema.js";
import { type Piscina } from "piscina";

export class NewsReader {

    public async read(all_categories: Map<NewsCategory, Map<string, BriefNewsLike>>, pool: Piscina, readOptions: ReadOptions): Promise<Map<NewsCategory, Map<string, BriefNewsLike>>> {
        if (all_categories.size === 0) {
            throw new Error("Categories map cannot be empty.");
        }

        const tasks = Array.from(all_categories.values(), (items) =>
            pool.run({ items, options: readOptions },
                { name: 'readNewsDetails', filename: new URL('./_read.js', import.meta.url).href })
        );
        const results = await Promise.allSettled(tasks);
        const categories: NewsCategory[] = [...all_categories.keys()];
        for (let i = 0; i < categories.length; i++) {
            const result = results[i]!;
            if (result.status === 'rejected') {
                console.error(`\n🚨🚨🚨 [READ ERROR] Failed to read news for category "${categories[i]!}" 🚨🚨🚨`);
                console.error(result.reason);
                console.error(`=========================================================\n`);
                all_categories.delete(categories[i]!);
                continue;
            }
            const items: Map<string, BriefNewsLike> = result.value;
            all_categories.set(categories[i]!, items);
        }

        if (all_categories.size === 0) {
            throw new Error("All categories failed to read.");
        }

        return all_categories;
    }
}