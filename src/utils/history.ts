import { Repository, MoreThanOrEqual } from "typeorm";
import { type NewsHistory } from "../types/new_history.interface.js";
import { type BriefNews } from "../types/brief_news.entity.js";

export class TypeOrmNewsHistory implements NewsHistory {
    constructor(
        private readonly repository: Repository<BriefNews>,
        private readonly time_window_days: number
    ) { }

    async fetchHistory(): Promise<Map<string, BriefNews>> {
        const items: BriefNews[] = await this.repository.find({
            where: {
                source_date: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000 * this.time_window_days))
            }
        });
        return new Map(items.map(item => [item.hash_id, item]));
    }

    async saveHistory(items: Map<string, BriefNews>): Promise<void> {
        await this.repository.save([...items.values()]);
    }
}