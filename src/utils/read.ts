import { type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { type ReadOptions, ReadOptionsSchema } from "../types/config.schema.js";
import { type Piscina } from "piscina";

export class NewsReader {
    private readonly pool: Piscina;
    private readonly readOptions: ReadOptions;

    constructor(
        pool: Piscina,
        readOptions: ReadOptions = {}
    ) {
        this.pool = pool;
        this.readOptions = ReadOptionsSchema.parse(readOptions);
    }

    public async read(all_categories: Map<NewsCategory, Map<string, BriefNewsLike>>): Promise<Map<NewsCategory, Map<string, BriefNewsLike>>> {
        const tasks = Array.from(all_categories.values(), (items) =>
            this.pool.run({ items, options: this.readOptions },
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