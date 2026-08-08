import { type BriefNewsLike, type NewsCategory } from "./brief_news.entity.js"

export abstract class NewsHistory {
    abstract fetchHistory(data_src: unknown, category: NewsCategory, options: Record<string, string | number | boolean | undefined>): Promise<Map<string, BriefNewsLike>>;
    abstract saveHistory(data_src: unknown, items: Map<string, BriefNewsLike>): Promise<void>;
}