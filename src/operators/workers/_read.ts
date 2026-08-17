/**
 * @module NewsDeepReader
 * @description Fetches and extracts full article text for BriefNews items
 * produced by the fetch module. Each item's `raw` property is populated
 * in-place with the extracted body text.
 *
 * @example
 * ```typescript
 * import { readNewsDetails, ReadOptions } from "./utils/read";
 * import { BriefNews } from "../types/brief_news.entity.js";
 *
 * const items: Map<string, BriefNews> = await fetchNewsByCategory("international");
 *
 * // Populate the `raw` field on each item (mutates in-place, returns same ref)
 * await readNewsDetails({ items });
 *
 * // With custom options:
 * const options: ReadOptions = {
 *     timeout: 15000,       // Per-request HTTP timeout (default 30000)
 *     maxBodyChars: 30000,  // Cap on extracted text per article (default 50000)
 *     concurrency: 3,       // Max parallel requests (default 5)
 * };
 * await readNewsDetails({ items, options });
 * ```
 *
 * ### Source Routing
 * The extractor is selected by `source_name` first, then by URL hostname.
 * Source-specific extractors are ported from the skill's Python
 * `deep_read_body.py`. Sources requiring browser automation are skipped.
 *
 * ### Error Handling
 *
 * **1. Expected Errors (Network & Parsing)**
 * Network failures, HTTP errors, empty extractions, and invalid URLs are
 * caught per-item. The item's `raw` is left `undefined` and processing
 * continues with the next item.
 *
 * **2. Unexpected Errors (Invalid Input)**
 * Calling with a non-map or empty map throws a `TypeError` immediately.
 */

import pLimit from "p-limit";
import { type BriefNewsLike } from "../../types/brief_news.entity.js";
import { type ReadOptions } from "../readNews.operator.js";
import { logExpectedError } from "../common/errors.js";

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const MAX_BODY_CHARS = Infinity; // No length limit on article body
const CONCURRENCY = 5;
const MAX_PARAGRAPHS = 100;

// ─── Types ───────────────────────────────────────────────────

type HtmlExtractor = (html: string) => string;

// ─── HTML Utilities ──────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    nbsp: " ", mdash: "—", ndash: "–", lsquo: "\u2018", rsquo: "\u2019",
    ldquo: "\u201C", rdquo: "\u201D", hellip: "\u2026", bull: "\u2022",
    copy: "\u00A9", reg: "\u00AE", trade: "\u2122",
    times: "\u00D7", divide: "\u00F7", middot: "\u00B7",
};

function htmlUnescape(s: string): string {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
        if (entity.startsWith("#x") || entity.startsWith("#X")) {
            const code = parseInt(entity.slice(2), 16);
            return isNaN(code) ? match : String.fromCodePoint(code);
        }
        if (entity.startsWith("#")) {
            const code = parseInt(entity.slice(1), 10);
            return isNaN(code) ? match : String.fromCodePoint(code);
        }
        return HTML_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

function stripTags(s: string): string {
    return htmlUnescape(s.replace(/<[^>]+>/g, " ").trim());
}

function collapseWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

// ─── HTML Extractors ─────────────────────────────────────────
// Ported from news-briefing/scripts/deep_read_body.py.
// Each extractor receives raw HTML and returns extracted body text
// as paragraphs joined by "\n\n".

/**
 * BBC articles use `data-component="text-block"` wrappers around `<p>` tags.
 * Fallback: all `<p>` tags with content longer than 40 chars.
 */
function extractBbc(html: string): string {
    let blocks = [...html.matchAll(/data-component="text-block".*?<p[^>]*>(.*?)<\/p>/gs)]
        .map(m => m[1] ?? "");
    if (blocks.length === 0) {
        blocks = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
            .map(m => m[1] ?? "")
            .filter(p => {
                const len = stripTags(p).length;
                return len > 40 && len < 5000;
            });
    }
    const paragraphs = blocks
        .map(b => collapseWhitespace(stripTags(b)))
        .filter(Boolean);
    return paragraphs.slice(0, MAX_PARAGRAPHS).join("\n\n");
}

/**
 * CNN articles use `data-component-name="paragraph"` blocks.
 * Filter range: 50–5000 chars (upper bound filters inline CSS blocks).
 * Fallback: generic extractor.
 */
function extractCnn(html: string): string {
    const blocks = [...html.matchAll(/data-component-name="paragraph"[^>]*>(.*?)<\/div>/gs)]
        .map(m => collapseWhitespace(stripTags(m[1] ?? "")))
        .filter(p => p.length > 50 && p.length < 5000);
    if (blocks.length > 0) {
        return blocks.slice(0, MAX_PARAGRAPHS).join("\n\n");
    }
    return extractGeneric(html);
}

/**
 * TechCrunch articles use an `article-content` class wrapper.
 * Fallback: all `<p>` tags > 40 chars, then split by `</p><p>` boundaries.
 */
function extractTechcrunch(html: string): string {
    const body = html.match(/<div[^>]*class="[^"]*article-content[^"]*"[^>]*>(.*?)<\/article>/s);
    let text: string;
    if (body?.[1]) {
        text = body[1];
    } else {
        const ps = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
            .map(m => m[1] ?? "")
            .filter(p => stripTags(p).length > 40)
            .slice(0, 20);
        text = ps.map(p => collapseWhitespace(stripTags(p))).join(" ");
    }
    const paragraphs = text.split(/<\/p>\s*<p[^>]*>/);
    const clean = paragraphs
        .map(p => collapseWhitespace(stripTags(p)))
        .filter(c => c.length > 20);
    return clean.slice(0, MAX_PARAGRAPHS).join("\n\n");
}

/**
 * F1 official articles: all `<p>` tags with content > 50 chars.
 */
function extractF1(html: string): string {
    const ps = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
        .map(m => m[1] ?? "")
        .filter(p => {
            const len = stripTags(p).length;
            // Also filter out generic nav links that leak into F1 paragraphs
            const text = stripTags(p).toLowerCase();
            if (text.includes("sign in") && text.includes("subscribe")) return false;
            return len > 50 && len < 5000;
        });
    const clean = ps.map(p => collapseWhitespace(stripTags(p)));
    return clean.slice(0, MAX_PARAGRAPHS).join("\n\n");
}

/**
 * Marca articles: all `<p>` tags with content > 40 chars.
 * Note: Marca blocks headless browsers — curl-only source.
 */
function extractMarca(html: string): string {
    const ps = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
        .map(m => m[1] ?? "")
        .filter(p => {
            const len = stripTags(p).length;
            return len > 40 && len < 5000;
        });
    const clean = ps.map(p => collapseWhitespace(stripTags(p)));
    return clean.slice(0, MAX_PARAGRAPHS).join("\n\n");
}

/**
 * Motorsport.com articles: `.ms-article__body` container, fallback generic.
 * Note: CloudFront 403 is common — will be caught as a network error.
 */
function extractMotorsport(html: string): string {
    const body = html.match(/<div[^>]*class="[^"]*ms-article__body[^"]*"[^>]*>(.*?)<\/div>/s);
    if (body?.[1]) {
        const ps = [...body[1].matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
            .map(m => m[1] ?? "")
            .filter(p => stripTags(p).length > 40);
        if (ps.length > 0) {
            const clean = ps.map(p => collapseWhitespace(stripTags(p)));
            return clean.slice(0, MAX_PARAGRAPHS).join("\n\n");
        }
    }
    return extractGeneric(html);
}

/**
 * Generic fallback extractor for unknown sources.
 * All `<p>` tags filtered by both lower (40) and upper (5000) char bounds.
 * The upper bound prevents inline CSS/JS blocks from being captured
 * (documented issue with CNN and other SSR pages).
 */
function extractGeneric(html: string): string {
    const ps = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
        .map(m => m[1] ?? "")
        .filter(p => {
            const len = stripTags(p).length;
            return len > 40 && len < 5000;
        });
    const clean = ps.map(p => collapseWhitespace(stripTags(p)));
    return clean.slice(0, MAX_PARAGRAPHS).join("\n\n");
}

// ─── Extractor Routing ───────────────────────────────────────

/** Maps source_name (as set by fetch.ts) to the appropriate extractor. */
const SOURCE_NAME_EXTRACTORS: Record<string, HtmlExtractor> = {
    "BBC": extractBbc,
    "BBC Sport": extractBbc,
    "CNN": extractCnn,
    "TechCrunch": extractTechcrunch,
    "Marca": extractMarca,
    "Managing Madrid": extractGeneric,
    "Football España": extractGeneric,
    "AS": extractGeneric,
    "Formula 1": extractF1,
    "Motorsport.com": extractMotorsport,
    "RaceFans": extractGeneric,
    "澎湃新闻": extractGeneric,
    "南方都市报": extractGeneric,
};

/**
 * Maps URL hostname to extractor. Used as a fallback when source_name doesn't
 * match (e.g. Google News items whose URLs were resolved to publisher domains).
 */
const HOST_EXTRACTORS: Record<string, HtmlExtractor> = {
    "www.bbc.com": extractBbc,
    "bbc.com": extractBbc,
    "www.bbc.co.uk": extractBbc,
    "bbc.co.uk": extractBbc,
    "edition.cnn.com": extractCnn,
    "www.cnn.com": extractCnn,
    "cnn.com": extractCnn,
    "techcrunch.com": extractTechcrunch,
    "www.techcrunch.com": extractTechcrunch,
    "www.marca.com": extractMarca,
    "marca.com": extractMarca,
    "www.managingmadrid.com": extractGeneric,
    "managingmadrid.com": extractGeneric,
    "football-espana.net": extractGeneric,
    "www.football-espana.net": extractGeneric,
    "en.as.com": extractGeneric,
    "as.com": extractGeneric,
    "www.formula1.com": extractF1,
    "formula1.com": extractF1,
    "www.motorsport.com": extractMotorsport,
    "motorsport.com": extractMotorsport,
    "www.racefans.net": extractGeneric,
    "racefans.net": extractGeneric,
    "www.thepaper.cn": extractGeneric,
    "thepaper.cn": extractGeneric,
    "www.nfnews.com": extractGeneric,
    "nfnews.com": extractGeneric,
};

/** Sources whose article pages are skipped (e.g. Motorsport.com 403s but has RSS description pre-populated) */
const SKIP_SOURCE_NAMES = new Set(["Motorsport.com"]);

/** Hosts requiring browser automation, paywall subscriptions, or blocking automated HTTP scraping with Cloudflare/CloudFront bot challenge. */
const SKIP_HOSTS = new Set([
    "news.qq.com",
    "cepr.org",
    "dazn.com",
    "reuters.com",
    "wsj.com",
    "bloomberg.com",
    "ft.com",
    "nytimes.com"
]);

function isSkippedItem(item: BriefNewsLike): boolean {
    if (SKIP_SOURCE_NAMES.has(item.source_name)) return true;
    try {
        let host = new URL(item.url).hostname.toLowerCase();
        if (host.startsWith("www.")) host = host.slice(4);
        if (SKIP_HOSTS.has(host)) return true;
    } catch {
        // Invalid URL
    }
    return false;
}

/**
 * Select the right extractor for a BriefNews item, or `null` to skip.
 *
 * Priority: skip-list → source_name map → URL hostname map → generic fallback.
 */
function getExtractorForItem(item: BriefNewsLike): HtmlExtractor | null {
    if (isSkippedItem(item)) return null;

    const byName = SOURCE_NAME_EXTRACTORS[item.source_name];
    if (byName) return byName;

    try {
        const host = new URL(item.url).hostname.toLowerCase();
        const byHost = HOST_EXTRACTORS[host];
        if (byHost) return byHost;
    } catch {
        // Invalid URL — fall through to generic
    }

    return extractGeneric;
}

// ─── Time Extraction ─────────────────────────────────────────

function extractTime(rawHtml: string): Date | undefined {
    const patterns = [
        /"datePublished"\s*:\s*"([^"]+)"/,
        /datePublished&quot;\s*:\s*&quot;([^&]+)&quot;/,
        /<meta[^>]*name=["']datePublished["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]*name=["']pubdate["'][^>]*content=["']([^"']+)["']/i,
        /<time[^>]*datetime="([^"]+)"/,
        /"pubTime"\s*:\s*"([^"]+)"/,
        /class="source-time">([^<]+)/
    ];

    for (const pat of patterns) {
        const m = rawHtml.match(pat);
        if (m && m[1]) {
            let s = htmlUnescape(m[1].trim());
            if (/^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
                s = s.replace(/\//g, "-").replace(" ", "T") + "+08:00";
            }
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }
    return undefined;
}



// ─── HTTP Fetch ──────────────────────────────────────────────

async function fetchHtml(url: string, options?: ReadOptions): Promise<string> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(options?.read_timeout ?? DEFAULT_TIMEOUT_MS),
            headers: {
                "User-Agent": options?.read_user_agent ?? USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
            },
            redirect: "follow",
        });
        if (!response.ok) {
            throw new Error(`Request failed with status code ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to fetch ${url}: ${error.message}`, { cause: error });
        }
        throw error;
    }
}

// ─── Public API ──────────────────────────────────────────────

interface ReadArguments {
    items: Map<string, BriefNewsLike>,
    options?: ReadOptions
}

/**
 * Fetches and extracts full article text for a collection of BriefNews items.
 * Each item's `raw` property is populated in-place with the extracted text.
 *
 * @param items - Map of BriefNews items produced by fetchNewsByCategory.
 *                Must be a non-empty Map; otherwise a TypeError is thrown.
 * @param options - Optional overrides for timeout, concurrency, etc.
 * @returns The same `items` Map, with `raw` populated where extraction succeeded.
 *
 * @throws {TypeError} If `items` is not a Map or is empty.
 */
export async function readNewsDetails({ items, options }: ReadArguments): Promise<Map<string, BriefNewsLike>> {
    if (!(items instanceof Map)) {
        throw new TypeError("readNewsDetails: expected a Map of BriefNews items");
    }
    if (items.size === 0) {
        return items;
    }

    const maxBody = options?.read_max_body_chars ?? MAX_BODY_CHARS;
    const concurrencyLimit = options?.read_concurrency ?? CONCURRENCY;
    const limit = pLimit(concurrencyLimit);

    const tasks = Array.from(items.values()).map((item) => {
        return limit(async () => {
            if (isSkippedItem(item)) {
                if (item.source_date.getTime() === 0) {
                    item.source_date = new Date();
                }
                return;
            }
            const extractor = getExtractorForItem(item);
            if (!extractor) {
                logExpectedError(new Error(`No extractor found for item: ${item.title}`));
                return;
            }
            if (!item.url?.trim()) {
                logExpectedError(new Error(`Missing or empty URL for item: ${item.title}`));
                return;
            }

            try {
                const parsed = new URL(item.url);
                if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                    logExpectedError(new Error(`Unsupported protocol (${parsed.protocol}) for URL: ${item.url}`));
                    return;
                }
            } catch (error) {
                // new URL throws TypeError for invalid URLs
                logExpectedError(new Error(`Invalid URL: ${item.url}`));
                return;
            }

            try {
                const html = await fetchHtml(item.url, options);
                const body = extractor(html);
                const parsedDate = extractTime(html);

                if (body) {
                    item.raw = body.slice(0, maxBody);
                }
                if (parsedDate) {
                    if (item.source_date.getTime() === 0 || item.source_date.getTime() < parsedDate.getTime()) {
                        item.source_date = parsedDate;
                    }
                }

                // Fallback if still no valid date is available
                if (item.source_date.getTime() === 0) {
                    item.source_date = new Date();
                }
            } catch (error) {
                if (error instanceof Error) {
                    logExpectedError(error);
                    return;
                }
                throw error;
            }
        });
    });

    //RISK: ANY REJECTED TASK WILL STOP THE WHOLE PROCESS
    const settled = await Promise.allSettled(tasks);
    for (const result of settled) {
        if (result.status === "rejected") {
            throw result.reason;
        }
    }

    return items;
}
