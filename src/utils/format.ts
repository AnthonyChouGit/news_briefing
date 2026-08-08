import { NewsFormat } from "../types/news_format.base.js";
import type { NewsCategory, BriefNewsLike } from "../types/brief_news.entity.js";
import { type Language } from "../types/language.enum.js";

/** Characters that must be escaped in Telegram MarkdownV2 (outside code spans / URLs). */
const MD_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape a string for use in Telegram MarkdownV2 text contexts. */
function escapeMarkdownV2(text: string): string {
    return text.replace(MD_V2_SPECIAL, "\\$1");
}

/** Emoji prefix for each category (language-independent). */
const CATEGORY_EMOJI: Record<NewsCategory, string> = {
    international: "🌍",
    football:      "⚽",
    realmadrid:    "🤍",
    f1:            "🏎️",
    ai:            "🤖",
    mlb:           "⚾",
    shenzhen:      "🏙️",
    tabletennis:   "🏓",
};

/** Localized category display names keyed by Language then NewsCategory. */
const CATEGORY_LABELS: Record<string, Record<NewsCategory, string>> = {
    English:    { international: "International",   football: "Football",       realmadrid: "Real Madrid",   f1: "Formula 1",   ai: "AI & Tech",          mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Table Tennis" },
    Chinese:    { international: "国际",             football: "足球",            realmadrid: "皇家马德里",    f1: "F1 赛车",     ai: "AI 与科技",           mlb: "美国职棒",  shenzhen: "深圳",       tabletennis: "乒乓球" },
    Spanish:    { international: "Internacional",   football: "Fútbol",         realmadrid: "Real Madrid",   f1: "Fórmula 1",   ai: "IA y Tecnología",    mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Tenis de Mesa" },
    French:     { international: "International",   football: "Football",       realmadrid: "Real Madrid",   f1: "Formule 1",   ai: "IA et Tech",         mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Tennis de Table" },
    German:     { international: "International",   football: "Fußball",        realmadrid: "Real Madrid",   f1: "Formel 1",    ai: "KI & Technik",       mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Tischtennis" },
    Italian:    { international: "Internazionale",  football: "Calcio",         realmadrid: "Real Madrid",   f1: "Formula 1",   ai: "IA e Tecnologia",    mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Tennistavolo" },
    Portuguese: { international: "Internacional",   football: "Futebol",        realmadrid: "Real Madrid",   f1: "Fórmula 1",   ai: "IA e Tecnologia",    mlb: "MLB",      shenzhen: "Shenzhen",   tabletennis: "Tênis de Mesa" },
    Russian:    { international: "Международные",   football: "Футбол",         realmadrid: "Реал Мадрид",   f1: "Формула 1",   ai: "ИИ и технологии",    mlb: "MLB",      shenzhen: "Шэньчжэнь", tabletennis: "Настольный теннис" },
    Japanese:   { international: "国際",             football: "サッカー",        realmadrid: "レアル・マドリード", f1: "F1",       ai: "AI・テクノロジー",    mlb: "MLB",      shenzhen: "深セン",     tabletennis: "卓球" },
    Korean:     { international: "국제",             football: "축구",            realmadrid: "레알 마드리드",  f1: "F1",          ai: "AI & 테크",          mlb: "MLB",      shenzhen: "선전",       tabletennis: "탁구" },
};

/**
 * Preferred display order for categories.
 * Categories missing from this list are appended at the end.
 */
const CATEGORY_ORDER: readonly NewsCategory[] = [
    "international", "ai", "football", "realmadrid",
    "f1", "mlb", "tabletennis", "shenzhen",
] as const;

export class TelegramNewsFormatMD extends NewsFormat {
    formatNews(
        all_items: Map<NewsCategory, Map<string, BriefNewsLike>>,
        options: { language: Language },
    ): string {
        const sections: string[] = [];

        // Date header — use the most recent source_date across all items.
        const dateHeader = this.buildDateHeader(all_items, options.language);
        if (dateHeader) sections.push(dateHeader);

        // Sort categories in preferred display order.
        const sortedCategories = this.sortCategories([...all_items.keys()]);

        for (const category of sortedCategories) {
            const items = all_items.get(category);
            if (!items || items.size === 0) continue;

            const section = this.formatCategorySection(category, items, options.language);
            if (section) sections.push(section);
        }

        if (sections.length === 0) {
            return escapeMarkdownV2("No news to report today.");
        }

        return sections.join("\n\n");
    }

    // ── Private helpers ────────────────────────────────────────────────

    /** Build a localised date header from the newest article across all categories. */
    private buildDateHeader(
        all_items: Map<NewsCategory, Map<string, BriefNewsLike>>,
        language: Language,
    ): string | undefined {
        let latest: Date | undefined;
        for (const items of all_items.values()) {
            for (const item of items.values()) {
                if (!latest || item.source_date > latest) latest = item.source_date;
            }
        }
        if (!latest) return undefined;

        const locale = LANGUAGE_LOCALE[language] ?? "en-US";
        const formatted = latest.toLocaleString(locale, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        return `*📰 ${escapeMarkdownV2(formatted)}*`;
    }

    /** Sort categories according to the preferred display order. */
    private sortCategories(categories: NewsCategory[]): NewsCategory[] {
        return categories.sort((a, b) => {
            const ia = CATEGORY_ORDER.indexOf(a);
            const ib = CATEGORY_ORDER.indexOf(b);
            return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
        });
    }

    /** Render a single category section with its articles. */
    private formatCategorySection(
        category: NewsCategory,
        items: Map<string, BriefNewsLike>,
        language: Language,
    ): string | undefined {
        // Sort articles by date, newest first.
        const sorted = [...items.values()].sort(
            (a, b) => b.source_date.getTime() - a.source_date.getTime(),
        );

        if (sorted.length === 0) return undefined;

        const emoji = CATEGORY_EMOJI[category] ?? "📌";
        const name = CATEGORY_LABELS[language]?.[category] ?? CATEGORY_LABELS["English"]![category] ?? category;
        const label = `${emoji} ${name}`;
        const lines: string[] = [`*${escapeMarkdownV2(label)}*`];

        for (const item of sorted) {
            lines.push(this.formatArticle(item));
        }

        return lines.join("\n");
    }

    /**
     * Render a single article.
     *
     * Format:
     * ```
     * • [Title](url) — _Source_
     *   ◦ bullet 1
     *   ◦ bullet 2
     * ```
     *
     * In MarkdownV2, the URL inside `[text](url)` must NOT be escaped,
     * but the link text must be.
     */
    private formatArticle(item: BriefNewsLike): string {
        const title = escapeMarkdownV2(item.title);
        const source = escapeMarkdownV2(item.source_name);
        const url = item.url; // URLs inside (...) are not escaped in MarkdownV2.

        const parts: string[] = [
            `• [${title}](${url}) — _${source}_`,
        ];

        if (item.bullets && item.bullets.length > 0) {
            for (const bullet of item.bullets) {
                parts.push(`  ◦ ${escapeMarkdownV2(bullet)}`);
            }
        }

        return parts.join("\n");
    }
}

/** Map Language enum values to BCP 47 locale tags for date formatting. */
const LANGUAGE_LOCALE: Record<string, string> = {
    English:    "en-US",
    Chinese:    "zh-CN",
    Spanish:    "es-ES",
    French:     "fr-FR",
    German:     "de-DE",
    Italian:    "it-IT",
    Portuguese: "pt-BR",
    Russian:    "ru-RU",
    Japanese:   "ja-JP",
    Korean:     "ko-KR",
};