import { type NewsCategory, type BriefNewsLike } from "./brief_news.entity.js";

export abstract class NewsFormat {
    abstract formatNews(all_items: Map<NewsCategory, Map<string, BriefNewsLike>>, options?: Record<string, string | number | boolean | undefined>): Promise<string> | string
}