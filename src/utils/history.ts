import { Repository, MoreThanOrEqual } from "typeorm";
import { NewsHistory } from "../types/news_history.base.js";
import { BriefNews, type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";

export class TypeOrmNewsHistory extends NewsHistory {

    async fetchHistory(data_src: Repository<BriefNews>, category: NewsCategory, options: { time_window_days: number }): Promise<Map<string, BriefNewsLike>> {
        const items: BriefNews[] = await data_src.find({
            where: {
                category: category,
                source_date: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000 * options.time_window_days))
            }
        });
        return new Map(items.map(item => [item.hash_id, item]));
    }

    async saveHistory(data_src: Repository<BriefNews>, items: Map<string, BriefNewsLike>): Promise<void> {
        const entities = [...items.values()].map(item => data_src.create(item));
        await data_src.save(entities);
    }
}