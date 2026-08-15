import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { LanguageSchema, type Language } from "../types/language.enum.js";

export const FormatNewsOptionsSchema = z.object({
    language: LanguageSchema.default('English'),
    time_zone: z.string().optional(),
    debug: z.coerce.boolean().default(false)
});
export type FormatNewsOptions = z.infer<typeof FormatNewsOptionsSchema>;

// ── Telegram MarkdownV2 helpers ─────────────────────────────────────

/** Characters that must be escaped in Telegram MarkdownV2 (outside code spans / URLs). */
const MD_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape a string for use in Telegram MarkdownV2 text contexts. */
function escapeMarkdownV2(text: string): string {
    return text.replace(MD_V2_SPECIAL, "\\$1");
}

// ── Category display data ───────────────────────────────────────────

/** Emoji prefix for each category (language-independent). */
const CATEGORY_EMOJI: Record<NewsCategory, string> = {
    international: "🌍",
    football: "⚽",
    realmadrid: "🤍",
    f1: "🏎️",
    ai: "🤖",
    mlb: "⚾",
    shenzhen: "🏙️",
    tabletennis: "🏓",
};

/** Localized category display names keyed by Language then NewsCategory. */
const CATEGORY_LABELS: Record<string, Record<NewsCategory, string>> = {
    English: { international: "International", football: "Football", realmadrid: "Real Madrid", f1: "Formula 1", ai: "AI & Tech", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Table Tennis" },
    Chinese: { international: "国际视野", football: "足球", realmadrid: "皇家马德里", f1: "F1·赛车", ai: "AI·大模型", mlb: "MLB·棒球", shenzhen: "深圳·国内", tabletennis: "乒乓球" },
    Spanish: { international: "Panorama Internacional", football: "Fútbol", realmadrid: "Real Madrid", f1: "Fórmula 1", ai: "IA y Tecnología", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Tenis de Mesa" },
    French: { international: "International", football: "Football", realmadrid: "Real Madrid", f1: "Formule 1", ai: "IA et Tech", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Tennis de Table" },
    German: { international: "International", football: "Fußball", realmadrid: "Real Madrid", f1: "Formel 1", ai: "KI & Technik", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Tischtennis" },
    Italian: { international: "Internazionale", football: "Calcio", realmadrid: "Real Madrid", f1: "Formula 1", ai: "IA e Tecnologia", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Tennistavolo" },
    Portuguese: { international: "Internacional", football: "Futebol", realmadrid: "Real Madrid", f1: "Fórmula 1", ai: "IA e Tecnologia", mlb: "MLB", shenzhen: "Shenzhen", tabletennis: "Tênis de Mesa" },
    Russian: { international: "Международные", football: "Футбол", realmadrid: "Реал Мадрид", f1: "Формула 1", ai: "ИИ и технологии", mlb: "MLB", shenzhen: "Шэньчжэнь", tabletennis: "Настольный теннис" },
    Japanese: { international: "国際情勢", football: "サッカー", realmadrid: "レアル・マドリード", f1: "F1", ai: "AI・テクノロジー", mlb: "MLB", shenzhen: "深セン・国内", tabletennis: "卓球" },
    Korean: { international: "국제", football: "축구", realmadrid: "레알 마드리드", f1: "F1", ai: "AI & 테크", mlb: "MLB", shenzhen: "선전·국내", tabletennis: "탁구" },
};

/**
 * Preferred display order for categories.
 * Categories missing from this list are appended at the end.
 */
const CATEGORY_ORDER: readonly NewsCategory[] = [
    "international", "ai", "football", "realmadrid",
    "f1", "mlb", "tabletennis", "shenzhen",
] as const;

/** Map Language enum values to BCP 47 locale tags for date formatting. */
const LANGUAGE_LOCALE: Record<string, string> = {
    English: "en-US",
    Chinese: "zh-CN",
    Spanish: "es-ES",
    French: "fr-FR",
    German: "de-DE",
    Italian: "it-IT",
    Portuguese: "pt-BR",
    Russian: "ru-RU",
    Japanese: "ja-JP",
    Korean: "ko-KR",
};

// ── Formatting functions ────────────────────────────────────────────

/** Build a localised date header for the news briefing. */
function buildDateHeader(
    all_items: Map<NewsCategory, Map<string, BriefNewsLike>>,
    language: Language,
    time_zone?: string,
): string {
    const now = new Date();
    const locale = LANGUAGE_LOCALE[language] ?? "en-US";
    const dateStr = now.toLocaleDateString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(time_zone ? { timeZone: time_zone } : {}),
    });
    const timeStr = now.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        ...(time_zone ? { timeZone: time_zone } : {}),
    });
    const dateTimeStr = `${dateStr} ${timeStr}`;

    const categoryEmojis = sortCategories([...all_items.keys()])
        .map((cat) => CATEGORY_EMOJI[cat] ?? "")
        .filter(Boolean)
        .join("");

    const titlePrefix = language === "Chinese" ? "新闻简报" : "News Briefing";
    return `📰 *${escapeMarkdownV2(titlePrefix)} \\| ${escapeMarkdownV2(dateTimeStr)} ${categoryEmojis}*`;
}

/** Sort categories according to the preferred display order. */
function sortCategories(categories: NewsCategory[]): NewsCategory[] {
    return categories.sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
}

function formatItemDate(date: Date, language: Language, time_zone?: string): string {
    const locale = LANGUAGE_LOCALE[language] ?? "en-US";
    return date.toLocaleString(locale, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        ...(time_zone ? { timeZone: time_zone } : {}),
    });
}

/**
 * Render a single article.
 *
 * Format:
 * ```
 * • *Title* Date [Source](url)
 * bullet 1
 * bullet 2
 * ```
 */
function formatArticle(item: BriefNewsLike, language: Language, time_zone?: string): string {
    const title = escapeMarkdownV2(item.title);
    const source = escapeMarkdownV2(item.source_name);
    const url = item.url;
    const sourceLink = url ? `[${source}](${url})` : `_${source}_`;

    let dateStr = "";
    if (item.source_date && item.source_date.getTime() > 0) {
        dateStr = ` ${escapeMarkdownV2(formatItemDate(item.source_date, language, time_zone))}`;
    }

    const parts: string[] = [
        `• *${title}*${dateStr} ${sourceLink}`,
    ];

    if (item.bullets && item.bullets.length > 0) {
        for (const bullet of item.bullets) {
            parts.push(`  • ${escapeMarkdownV2(bullet)}`);
        }
    }

    return parts.join("\n");
}

/** Render a single category section with its articles. */
function formatCategorySection(
    category: NewsCategory,
    items: Map<string, BriefNewsLike>,
    language: Language,
    time_zone?: string,
): string | undefined {
    // Sort articles by date, newest first.
    const sorted = [...items.values()].sort(
        (a, b) => b.source_date.getTime() - a.source_date.getTime(),
    );

    if (sorted.length === 0) return undefined;

    const emoji = CATEGORY_EMOJI[category] ?? "📌";
    const name = CATEGORY_LABELS[language]?.[category] ?? CATEGORY_LABELS["English"]![category] ?? category;
    const header = `${emoji} *${escapeMarkdownV2(name)}*`;

    const articleBlocks = sorted.map((item) => formatArticle(item, language, time_zone));
    return `${header}\n${articleBlocks.join("\n\n")}`;
}

/** Format all news items into a Telegram MarkdownV2 message. */
function formatTelegramMarkdown(
    all_items: Map<NewsCategory, Map<string, BriefNewsLike>>,
    options: FormatNewsOptions,
): string {
    const sections: string[] = [];

    // Date header — use the most recent source_date across all items.
    const dateHeader = buildDateHeader(all_items, options.language, options.time_zone);
    if (dateHeader) sections.push(dateHeader);

    // Sort categories in preferred display order.
    const sortedCategories = sortCategories([...all_items.keys()]);

    for (const category of sortedCategories) {
        const items = all_items.get(category);
        if (!items || items.size === 0) continue;

        const section = formatCategorySection(category, items, options.language, options.time_zone);
        if (section) sections.push(section);
    }

    if (sections.length === 0) {
        return escapeMarkdownV2("No news to report today.");
    }

    return sections.join("\n\n");
}

// ── Operator schemas ────────────────────────────────────────────────

const FormatNewsInputSchema = z.object({
    format_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type FormatNewsInput = z.infer<typeof FormatNewsInputSchema>;

const FormatNewsOutputSchema = z.object({
    news_text: z.string().nonempty()
});
type FormatNewsOutput = z.infer<typeof FormatNewsOutputSchema>;

// ── Operator exec ───────────────────────────────────────────────────

export default async function formatNews({ inputs, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { format_input_items } = inputs as FormatNewsInput;
        const news_text = formatTelegramMarkdown(format_input_items, options as FormatNewsOptions);
        const op_output: FormatNewsOutput = { news_text };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 7, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class FormatNewsOperator extends Operator {
    name: string = "format_news";
    input_schema = FormatNewsInputSchema;
    output_schemas = { default: FormatNewsOutputSchema, error: ErrorInfoSchema };
    options_schema = FormatNewsOptionsSchema;
    exec = formatNews;
}

export class FormatNewsOperatorThread extends Operator {
    name: string = "format_news";
    input_schema = FormatNewsInputSchema;
    output_schemas = { default: FormatNewsOutputSchema, error: ErrorInfoSchema };
    options_schema = FormatNewsOptionsSchema;
    exec = import.meta.filename;
}