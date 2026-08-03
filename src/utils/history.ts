import { Repository, MoreThanOrEqual } from "typeorm";
import { NewsHistory } from "../types/history.js";
import { BriefNews, type BriefNewsLike } from "../types/brief_news.entity.js";

export class TypeOrmNewsHistory extends NewsHistory {
    constructor(
        private readonly repository: Repository<BriefNews>,
        private readonly time_window_days: number
    ) { super(); }

    async fetchHistory(): Promise<Map<string, BriefNewsLike>> {
        const items: BriefNews[] = await this.repository.find({
            where: {
                source_date: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000 * this.time_window_days))
            }
        });
        return new Map(items.map(item => [item.hash_id, item]));
    }

    async saveHistory(items: Map<string, BriefNewsLike>): Promise<void> {
        const entities = [...items.values()].map(item => this.repository.create(item));
        await this.repository.save(entities);
    }
}