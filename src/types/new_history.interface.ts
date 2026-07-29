import { type BriefNews } from "./brief_news.entity.js"

export interface NewsHistory {
    fetchHistory: () => Promise<Map<string, BriefNews>>,
    saveHistory(items: Map<string, BriefNews>): Promise<void>
}