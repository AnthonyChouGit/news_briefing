import { type BriefNewsLike } from "./brief_news.entity.js"

export abstract class NewsHistory {
    abstract fetchHistory(): Promise<Map<string, BriefNewsLike>>;
    abstract saveHistory(items: Map<string, BriefNewsLike>): Promise<void>;
}