import { type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { type ReadOptions, ReadOptionsSchema } from "../types/config.schema.js";
import { type Piscina } from "piscina";

export class NewsReader {

    public async read(all_categories: Map<NewsCategory, Map<string, BriefNewsLike>>, pool: Piscina, readOptions: ReadOptions): Promise<Map<NewsCategory, Map<string, BriefNewsLike>>> {
        const tasks = Array.from(all_categories.values(), (items) =>
            pool.run({ items, options: readOptions },
                { name: 'readNewsDetails', filename: new URL('./_read.js', import.meta.url).href })
        );
        const results = await Promise.allSettled(tasks);
        const categories: NewsCategory[] = [...all_categories.keys()];
        for (let i = 0; i < categories.length; i++) {
            const result = results[i]!;
            if (result.status === 'rejected')
                throw result.reason;
            const items: Map<string, BriefNewsLike> = result.value;
            all_categories.set(categories[i]!, items);
        }
        return all_categories;
    }
}