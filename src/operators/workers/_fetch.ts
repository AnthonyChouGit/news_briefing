/**
 * @module NewsFetchUtility
 * @description Provides fetching and parsing capabilities for news articles from various sources.
 *
 * @example
 * ```typescript
 * import { fetchNewsByCategory, FetchOptions } from "./utils/fetch";
 * import { BriefNews } from "../types/brief_news.entity.js";
 *
 * // Fetches all AI-related news concurrently from configured sources.
 * // You can optionally pass a FetchOptions object to override defaults:
 * const options: FetchOptions = { 
 *     timeout: 15000,          // Overrides DEFAULT_TIMEOUT_MS (default 30000)
 *     maxDecodeItems: 10,      // Overrides MAX_DECODE_ITEMS for RSS sources (default 5)
 *     userAgent: "Custom-Bot"  // Overrides the default USER_AGENT string
 * };
 * const aiNews: Map<string, BriefNews> = await fetchNewsByCategory("ai", options);
 * ```
 *
 * ### Supported Categories
 * The `fetchNewsByCategory` function accepts strongly-typed categories:
 * - `"international"`
 * - `"football"`
 * - `"realmadrid"`
 * - `"f1"`
 * - `"ai"`
 * - `"mlb"`
 * - `"shenzhen"`
 * - `"tabletennis"`
 *
 * ### Error Handling
 * 
 * **1. Expected Errors (Network & Parsing)**
 * The module throws {@link Error} for network issues (e.g. timeouts, 403 blocks) 
 * and {@link Error} for unexpected HTML/JSON structures.
 * 
 * *Note:* {@link fetchNewsByCategory} catches these expected errors internally on a 
 * per-source basis. If a single source fails, it silently falls back to returning an 
 * empty array for that source, allowing the other sources to continue processing.
 * 
 * **2. Unexpected Errors**
 * Unexpected runtime errors (e.g., TypeErrors) will bubble up. The caller should 
 * wrap the call in a standard `try/catch` to handle catastrophic failures.
 * 
 * When dealing with errors that propagate or if you use the individual source
 * fetchers directly, you can handle them as follows:
 * 
 * @example
 * ```typescript
 * try {
 *   const news = await fetchNewsByCategory("ai");
 * } catch (error) {
 *   if (error instanceof Error) {
 *     console.error(error.name);    // e.g. "TypeError"
 *     console.error(error.message); // A descriptive error message
 *     console.error(error.cause);   // Underlying original error (e.g. from fetch), if available
 *     console.error(error.stack);   // The stack trace
 *   }
 * }
 * ```
 */

import { createHash } from "node:crypto";
import { type BriefNewsLike } from "../../types/brief_news.entity.js";
import { type NewsCategory } from "../../types/news_category.enum.js";
import { logExpectedError } from "../common/errors.js";
import { type FetchOptions } from "../fetchNews.operator.js";

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_DECODE_ITEMS = 5;
const DROP_PARAMS = new Set([
    "fbclid", "gclid", "cmpid", "ocid", "ref", "source",
]);

// ─── Types ───────────────────────────────────────────────────

interface RawNewsItem {
    title: string;
    url: string;
    time: string;
    category: NewsCategory;
    raw?: string;
}


interface DecodeResult {
    status: "ok" | "passthrough" | "error";
    url?: string;
    reason?: string;
}

interface RssFeedConfig {
    url: string;
    category: NewsCategory;
    sourceName: string;
}

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
    return htmlUnescape(s.replace(/<[^>]+>/g, "").trim());
}

// ─── URL & Identity Utilities ────────────────────────────────

function canonicalUrl(rawUrl: string): string {
    const url = (rawUrl ?? "").trim();
    if (!url) return "";
    try {
        const parsed = new URL(url.includes("://") ? url : `https://${url}`);
        let host = parsed.hostname.toLowerCase();
        if (host.startsWith("www.")) host = host.slice(4);
        const path = parsed.pathname.replace(/\/+$/, "") || "/";
        const filteredParams: Array<[string, string]> = [];
        parsed.searchParams.forEach((v, k) => {
            const kl = k.toLowerCase();
            if (!kl.startsWith("utm_") && !DROP_PARAMS.has(kl)) {
                filteredParams.push([k, v]);
            }
        });
        filteredParams.sort(([a], [b]) => a.localeCompare(b));
        const query = new URLSearchParams(filteredParams).toString();
        const scheme = parsed.protocol.replace(":", "");
        return `${scheme}://${host}${path}${query ? "?" + query : ""}`;
    } catch {
        return url;
    }
}

function generateHashId(url: string, sourceName: string, title: string): string {
    const input = url ? canonicalUrl(url) : `${sourceName}:${title}`;
    return createHash("sha256").update(input).digest("hex");
}

/** Validate that a URL is a plausible article URL (not a homepage, search, or Google News wrapper). */
function isArticleUrl(url: string): boolean {
    if (!url.trim()) return false;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        if (!parsed.hostname) return false;
        if (parsed.hostname.includes("news.google.com")) return false;
        const path = parsed.pathname.replace(/\/+$/, "") || "/";
        const homePaths = new Set([
            "", "/", "/news", "/world", "/sport", "/latest",
            "/en/latest.html", "/category/artificial-intelligence/",
        ]);
        if (homePaths.has(path)) return false;
        const lowerPath = path.toLowerCase();
        if (["/search", "/tag/", "/category/", "/topics/"].some(x => lowerPath.includes(x))) return false;
        return path.split("/").length >= 2;
    } catch {
        return false;
    }
}

// ─── Date Parsing ────────────────────────────────────────────

export const FALLBACK_DATE = new Date(0);

function parseSourceDate(dateStr: string): Date {
    if (!dateStr.trim()) return FALLBACK_DATE;
    let s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        s = s.replace(" ", "T") + "+08:00";
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? FALLBACK_DATE : parsed;
}

// ─── BriefNews Factory ──────────────────────────────────────

function toBriefNews(item: RawNewsItem, sourceName: string): BriefNewsLike {
    return {
        hash_id: generateHashId(item.url, sourceName, item.title),
        url: item.url,
        title: item.title,
        source_date: parseSourceDate(item.time),
        source_name: sourceName,
        category: item.category,
        raw: item.raw,
        created_at: new Date()
    };
}

// ─── HTTP Utilities ──────────────────────────────────────────

async function fetchText(url: string, options?: FetchOptions): Promise<string> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(options?.fetch_timeout ?? DEFAULT_TIMEOUT_MS),
            headers: {
                "User-Agent": options?.fetch_user_agent ?? USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            },
            redirect: "follow",
        });
        if (!response.ok) {
            throw new Error(`Request failed with status code ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(
                `Failed to fetch ${url}: ${error.message}`,
                { cause: error },
            );
        }
        throw error;
    }
}

async function fetchJson(url: string, options?: FetchOptions): Promise<unknown> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(options?.fetch_timeout ?? DEFAULT_TIMEOUT_MS),
            headers: {
                "User-Agent": options?.fetch_user_agent ?? USER_AGENT,
                "Accept": "application/json, text/plain, */*",
            },
            redirect: "follow",
        });
        if (!response.ok) {
            throw new Error(`Request failed with status code ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(
                `Failed to fetch JSON from ${url}: ${error.message}`,
                { cause: error },
            );
        }
        throw error;
    }
}

// ─── Google News URL Decoder ─────────────────────────────────

function articleToken(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== "news.google.com") return null;
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;
        const secondLast = parts[parts.length - 2];
        if (secondLast !== "articles" && secondLast !== "read") return null;
        const token = parts[parts.length - 1];
        return token && token.length <= 4096 ? token : null;
    } catch {
        return null;
    }
}

function isValidPublisherUrl(url: string): boolean {
    if (typeof url !== "string" || url.length > 8192 || /[\x00-\x1f]/.test(url)) return false;
    try {
        const parsed = new URL(url);
        return (
            (parsed.protocol === "http:" || parsed.protocol === "https:") &&
            !!parsed.hostname &&
            parsed.hostname !== "news.google.com" &&
            !parsed.hostname.endsWith(".news.google.com") &&
            !parsed.username
        );
    } catch {
        return false;
    }
}

function* walkArrays(value: unknown): Generator<unknown[]> {
    if (Array.isArray(value)) {
        yield value;
        for (const child of value) {
            yield* walkArrays(child);
        }
    }
}

async function decodeGoogleNewsParams(
    token: string,
    options?: FetchOptions,
): Promise<{ timestamp: string; signature: string }> {
    const paths = ["rss/articles", "articles"];
    const errors: string[] = [];
    for (const path of paths) {
        try {
            const html = await fetchText(
                `https://news.google.com/${path}/${token}`,
                options,
            );
            const tsMatch = html.match(/data-n-a-ts="(\d+)"/);
            const sgMatch = html.match(/data-n-a-sg="([^"]+)"/);
            if (tsMatch?.[1] && sgMatch?.[1]) {
                return { timestamp: tsMatch[1], signature: sgMatch[1] };
            }
            errors.push("missing_params");
        } catch (error) {
            errors.push(error instanceof Error ? error.constructor.name : "UnknownError");
        }
    }
    throw new Error(`decode_params_failed: ${errors.join(",")}`);
}

async function decodeOneGoogleNewsUrl(
    token: string,
    timestamp: string,
    signature: string,
    options?: FetchOptions,
): Promise<string> {
    const inner = JSON.stringify([
        "garturlreq",
        [
            ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1,
                null, null, null, null, null, 0, 1],
            "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
        ],
        token, parseInt(timestamp, 10), signature,
    ]);
    const payload = JSON.stringify([[["Fbv4je", inner, null, "req0"]]]);
    const formData = `f.req=${encodeURIComponent(payload)}`;

    let body: string;
    try {
        const response = await fetch(
            "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
            {
                method: "POST",
                body: formData,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": options?.fetch_user_agent ?? USER_AGENT,
                    "Referer": "https://news.google.com/",
                },
                signal: AbortSignal.timeout(options?.fetch_timeout ?? DEFAULT_TIMEOUT_MS),
            },
        );
        if (!response.ok) {
            throw new Error(`Google News decode POST failed with status ${response.status}`);
        }
        body = await response.text();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Google News decode POST failed: ${error.message}`, { cause: error });
        }
        throw error;
    }

    for (const line of body.split("\n")) {
        let frame: unknown;
        try {
            frame = JSON.parse(line);
        } catch {
            continue;
        }
        for (const node of walkArrays(frame)) {
            if (Array.isArray(node) && node.length >= 3 && node[0] === "wrb.fr" && node[1] === "Fbv4je") {
                let nested: unknown;
                try {
                    nested = JSON.parse(node[2] as string);
                } catch {
                    continue;
                }
                if (
                    Array.isArray(nested) &&
                    nested.length > 1 &&
                    nested[0] === "garturlres"
                ) {
                    const url = nested[1] as string;
                    if (isValidPublisherUrl(url)) {
                        return url;
                    }
                }
            }
        }
    }
    throw new Error("decode_response_invalid");
}

async function resolveGoogleNewsUrls(
    urls: string[],
    options?: FetchOptions,
): Promise<DecodeResult[]> {
    const resolveOne = async (url: string): Promise<DecodeResult> => {
        const token = articleToken(url);
        if (token === null) {
            return { status: "passthrough", url };
        }
        try {
            const { timestamp, signature } = await decodeGoogleNewsParams(token, options);
            const resolved = await decodeOneGoogleNewsUrl(token, timestamp, signature, options);
            return { status: "ok", url: resolved };
        } catch {
            return { status: "error", reason: "decode_failed" };
        }
    };

    const settled = await Promise.allSettled(urls.map((u) => resolveOne(u)));
    return settled.map((result) =>
        result.status === "fulfilled"
            ? result.value
            : { status: "error" as const, reason: "unexpected_error" },
    );
}

// ─── Source Extractors ───────────────────────────────────────

function extractBbc(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();
    const pattern = /<h2[^>]*data-testid="card-headline"[^>]*>(.*?)<\/h2>/gs;
    for (const m of html.matchAll(pattern)) {
        const title = stripTags(m[1] ?? "");
        if (!title || title.length < 10) continue;
        const pos = m.index ?? 0;
        const before = html.slice(Math.max(0, pos - 5000), pos);
        let aLinks = [...before.matchAll(/<a[^>]*href="((?:https:\/\/www\.bbc\.com)?\/(?:news|sport)\/(?:articles|videos|live|[a-z0-9_-]+\/articles)\/[^"]+)"/g)];
        if (aLinks.length === 0) {
            const after = html.slice(pos, pos + 2000);
            aLinks = [...after.matchAll(/<a[^>]*href="((?:https:\/\/www\.bbc\.com)?\/(?:news|sport)\/(?:articles|videos|live|[a-z0-9_-]+\/articles)\/[^"]+)"/g)];
        }
        if (aLinks.length === 0) {
            aLinks = [...before.matchAll(/<a[^>]*href="((?:https:\/\/www\.bbc\.com)?\/(?:news|sport)\/[^"]+)"/g)];
        }
        const lastLink = aLinks[aLinks.length - 1];
        let url = lastLink?.[1] ? (lastLink[1].startsWith("http") ? lastLink[1] : `https://www.bbc.com${lastLink[1]}`) : "";
        if (!url || !isArticleUrl(url)) continue;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        results.push({ title, url, time: "", category: "international" });
    }
    return results;
}

function extractBbcSport(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();
    const pattern = /href="((?:https:\/\/www\.bbc\.com)?\/sport\/[^"]+\/articles\/[^"]+)"[^>]*>(.*?)<\/a>/gs;
    for (const m of html.matchAll(pattern)) {
        const rawUrlPath = m[1] ?? "";
        const title = stripTags(m[2] ?? "");
        if (!title || title.length < 10 || seen.has(rawUrlPath)) continue;
        seen.add(rawUrlPath);
        const url = rawUrlPath.startsWith("http") ? rawUrlPath : `https://www.bbc.com${rawUrlPath}`;
        if (!isArticleUrl(url)) continue;
        const cat = rawUrlPath.includes("football")
            ? "football"
            : rawUrlPath.includes("formula1")
                ? "f1"
                : "international";
        results.push({
            title,
            url,
            time: "",
            category: cat,
        });
    }
    return results;
}

function extractCnn(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();
    const pattern = /class="[^"]*container__headline[^"]*"[^>]*>(.*?)<\/span>/gs;
    for (const m of html.matchAll(pattern)) {
        const title = stripTags(m[1] ?? "");
        if (!title || title.length < 20) continue;
        if (title.startsWith(".") || title.startsWith("{") || title.startsWith("@") ||
            title.startsWith("function") || title.startsWith("var ") || title.startsWith("const ")) continue;
        if (title.includes("{") || title.includes("padding") || title.includes("margin")) continue;
        const pos = m.index ?? 0;
        const before = html.slice(Math.max(0, pos - 3000), pos);
        const allLinks = [...before.matchAll(/<a[^>]*href="(\/20\d{2}\/\d{2}\/\d{2}\/[^"]+)"/g)];
        const filtered = allLinks.filter((g) => !g[1]?.includes("/live-news/"));
        const lastLink = filtered[filtered.length - 1];
        const path = lastLink?.[1] ?? "";
        const fullUrl = path ? `https://edition.cnn.com${path}` : "";
        if (!fullUrl || !isArticleUrl(fullUrl)) continue;
        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);
        results.push({ title, url: fullUrl, time: "", category: "international" });
    }
    return results.slice(0, 50);
}

function extractMarca(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();

    // Article cards: <h2> with backward <a href> search
    const h2Pattern = /<h2[^>]*>(.*?)<\/h2>/gs;
    for (const m of html.matchAll(h2Pattern)) {
        const title = stripTags(m[1] ?? "");
        if (!title || title.length < 15 || seen.has(title)) continue;
        const pos = m.index ?? 0;
        const before = html.slice(Math.max(0, pos - 2000), pos);
        const aLinks = [...before.matchAll(/href="(https:\/\/www\.marca\.com\/[^"]+)"/g)];
        const lastLink = aLinks[aLinks.length - 1];
        const url = lastLink?.[1] ?? "";
        if (!url || seen.has(url) || !isArticleUrl(url)) continue;
        if (!url.toLowerCase().includes("/real-madrid/") && !url.toLowerCase().includes("/real_madrid/")) continue;
        seen.add(url);
        seen.add(title);
        results.push({ title, url, time: "", category: "realmadrid" });
    }
    return results;
}

function extractF1(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const pattern = /href="(\/en\/latest\/article\/[^"]+)"[^>]*>(.*?)<\/a>/gs;
    for (const m of html.matchAll(pattern)) {
        const urlPath = m[1] ?? "";
        const title = stripTags(m[2] ?? "");
        const url = `https://www.formula1.com${urlPath}`;
        if (title && title.length > 10 && isArticleUrl(url)) {
            results.push({
                title,
                url,
                time: "",
                category: "f1",
            });
        }
    }
    return results;
}

function extractTechcrunch(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();
    const pattern = /href="(https:\/\/techcrunch\.com\/20\d{2}\/\d{2}\/\d{2}\/[^"]+)"[^>]*>(.*?)<\/a>/gs;
    for (const m of html.matchAll(pattern)) {
        const url = m[1] ?? "";
        const title = stripTags(m[2] ?? "");
        if (!title || title.length < 10 || seen.has(url) || !isArticleUrl(url)) continue;
        seen.add(url);
        // Search forward for nearest <time datetime> (~500 chars)
        const afterStart = (m.index ?? 0) + m[0].length;
        const after = html.slice(afterStart, afterStart + 500);
        const timeMatch = after.match(/<time[^>]*datetime="([^"]+)"/);
        results.push({
            title,
            url,
            time: timeMatch?.[1] ?? "",
            category: "ai",
        });
    }
    return results;
}



function extractThepaper(html: string): RawNewsItem[] {
    // Build contId → pubTime map from embedded JSON data
    const timeMap = new Map<string, string>();
    const timePattern = /"contId":"?(\d+)"?[^}]{0,800}"pubTime":"([^"]*?)"/g;
    for (const pm of html.matchAll(timePattern)) {
        timeMap.set(pm[1] ?? "", pm[2] ?? "");
    }

    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();
    const h2Pattern = /<h2[^>]*>(.*?)<\/h2>/gs;
    const skipTitles = new Set(["推荐", "热榜", "视频", "专题", "广告"]);

    for (const m of html.matchAll(h2Pattern)) {
        const title = stripTags(m[1] ?? "");
        if (!title || title.length < 10 || title.length > 200) continue;
        if (skipTitles.has(title)) continue;

        const pos = m.index ?? 0;
        const before = html.slice(Math.max(0, pos - 3000), pos);
        const aLinks = [...before.matchAll(/<a[^>]*href="(\/newsDetail_forward_(\d+))"/g)];
        if (aLinks.length === 0) continue;

        const lastLink = aLinks[aLinks.length - 1]!;
        const url = `https://www.thepaper.cn${lastLink[1]}`;
        if (!isArticleUrl(url) || seenUrls.has(url)) continue;
        seenUrls.add(url);

        const contId = lastLink[2] ?? "";
        results.push({
            title,
            url,
            time: timeMap.get(contId) ?? "",
            category: "shenzhen",
        });
    }
    return results.slice(0, 30);
}

function extractNfnews(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seenUrls = new Set<string>();
    const pattern = /class="[^"]*title[^"]*"[^>]*>\s*(.{15,200}?)\s*<\//gs;

    for (const m of html.matchAll(pattern)) {
        let title = stripTags(m[1] ?? "");
        title = title.replace(/\s+(南方\+|南方\S*周刊|南方周末)\s*$/, "").trim();
        title = title.replace(/\s+\d{2}:\d{2}\s*$/, "").trim();
        if (!title || title.length < 10) continue;

        const pos = m.index ?? 0;
        const before = html.slice(Math.max(0, pos - 3000), pos);
        const aLinks = [
            ...before.matchAll(
                /<a[^>]*href="((?:https?:\/\/static\.nfnews\.com\/content\/|\/content\/)[^"]+)"/g,
            ),
        ];
        if (aLinks.length === 0) continue;

        const lastLink = aLinks[aLinks.length - 1]!;
        const rawHref = lastLink[1] ?? "";
        const url = rawHref.startsWith("http")
            ? rawHref
            : `https://www.nfnews.com${rawHref}`;
        if (!isArticleUrl(url) || seenUrls.has(url)) continue;
        seenUrls.add(url);
        results.push({ title, url, time: "", category: "shenzhen" });
    }
    return results.slice(0, 30);
}

function extractRacefans(html: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const seen = new Set<string>();
    // RaceFans wraps article links inside <h2> tags: <h2><a href="...">Title</a></h2>
    const pattern = /<h2[^>]*>(.*?)<\/h2>/gs;
    for (const m of html.matchAll(pattern)) {
        const inner = m[1] ?? "";
        const title = stripTags(inner);
        if (!title || title.length < 10 || title.toLowerCase().includes("caption")) continue;
        // Extract URL from <a> inside the <h2>
        const linkMatch = inner.match(/<a[^>]*href="(https?:\/\/www\.racefans\.net\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"/)
            ?? inner.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
        const url = linkMatch?.[1] ?? "";
        if (!url || !isArticleUrl(url) || seen.has(url)) continue;
        seen.add(url);
        results.push({ title, url, time: "", category: "f1" });
    }
    return results;
}

function extractRss(xml: string): RawNewsItem[] {
    const results: RawNewsItem[] = [];
    const itemPattern = /<item>(.*?)<\/item>/gs;
    for (const m of xml.matchAll(itemPattern)) {
        const item = m[1] ?? "";
        const titleMatch = item.match(/<title>(.*?)<\/title>/s);
        const linkMatch = item.match(/<link>(.*?)<\/link>/s);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/s);
        const descMatch = item.match(/<description>(.*?)<\/description>/s);

        if (!titleMatch?.[1]) continue;
        let title = titleMatch[1].trim();
        title = title.replace(/^<!\[CDATA\[(.*?)\]\]>$/s, "$1");
        title = htmlUnescape(title);
        if (!title || title.length <= 5) continue;

        const url = linkMatch?.[1]?.trim() ?? "";
        if (!url) continue;

        // Extract description text — used as pre-populated `raw` for sources
        // whose article pages are inaccessible (e.g. Motorsport.com: CloudFront 403).
        let raw: string | undefined;
        if (descMatch?.[1]) {
            let desc = descMatch[1].trim();
            desc = desc.replace(/^<!\[CDATA\[(.*?)\]\]>$/s, "$1");
            // Strip trailing "Keep reading" link and HTML tags
            desc = desc.replace(/<a[^>]*class=['"]more['"][^>]*>.*?<\/a>/gi, "");
            desc = stripTags(desc).trim();
            if (desc.length > 40) raw = desc;
        }

        const resultItem: RawNewsItem = {
            title,
            url,
            time: pubDateMatch?.[1]?.trim() ?? "",
            category: "international", // Default; overridden by feed config
        };
        if (raw) {
            resultItem.raw = raw;
        }
        results.push(resultItem);
    }
    return results;
}

// ─── Source Fetchers ─────────────────────────────────────────

async function fetchAndExtractHtml(
    url: string,
    sourceName: string,
    extractor: (html: string) => RawNewsItem[],
    options?: FetchOptions,
): Promise<BriefNewsLike[]> {
    try {
        const html = await fetchText(url, options);
        return extractor(html).map((item) => toBriefNews(item, sourceName));
    } catch (error) {
        if (error instanceof Error) {
            logExpectedError(error);
            return [];
        }
        throw error;
    }
}

async function fetchBbc(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://www.bbc.com/news", "BBC", extractBbc, options);
}

async function fetchBbcSport(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://www.bbc.com/sport", "BBC Sport", extractBbcSport, options);
}

async function fetchCnnWorld(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://edition.cnn.com/world", "CNN", extractCnn, options);
}

async function fetchCnnSport(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://edition.cnn.com/sport", "CNN", extractCnn, options);
}

async function fetchMarca(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml(
        "https://www.marca.com/en/football/real-madrid.html",
        "Marca",
        extractMarca,
        options,
    );
}

async function fetchF1(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml(
        "https://www.formula1.com/en/latest.html",
        "Formula 1",
        extractF1,
        options,
    );
}

async function fetchTechcrunch(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml(
        "https://techcrunch.com/category/artificial-intelligence/",
        "TechCrunch",
        extractTechcrunch,
        options,
    );
}



async function fetchThepaper(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://www.thepaper.cn", "澎湃新闻", extractThepaper, options);
}

async function fetchNfnews(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://www.nfnews.com", "南方都市报", extractNfnews, options);
}

async function fetchRacefans(options?: FetchOptions): Promise<BriefNewsLike[]> {
    return fetchAndExtractHtml("https://www.racefans.net", "RaceFans", extractRacefans, options);
}

// ─── RSS Feed Configuration ─────────────────────────────────

const RSS_FEEDS: Record<string, RssFeedConfig> = {
    gn_international: {
        url: "https://news.google.com/rss/search?q=international+news&hl=en-US&gl=US&ceid=US:en",
        category: "international",
        sourceName: "Google News",
    },
    gn_realmadrid: {
        url: "https://news.google.com/rss/search?q=%22Real+Madrid%22+when:2d&hl=en-US&gl=US&ceid=US:en",
        category: "realmadrid",
        sourceName: "Google News",
    },
    managing_madrid: {
        url: "https://www.managingmadrid.com/rss/index.xml",
        category: "realmadrid",
        sourceName: "Managing Madrid",
    },
    as_realmadrid: {
        url: "https://en.as.com/rss/soccer/real_madrid.xml",
        category: "realmadrid",
        sourceName: "AS",
    },
    marca_realmadrid: {
        url: "https://e00-marca.uecdn.es/rss/futbol/real-madrid.xml",
        category: "realmadrid",
        sourceName: "Marca",
    },
    gn_f1: {
        url: "https://news.google.com/rss/search?q=Formula+1+Ferrari+Leclerc&hl=en-US&gl=US&ceid=US:en",
        category: "f1",
        sourceName: "Google News",
    },
    gn_mlb: {
        url: "https://news.google.com/rss/search?q=MLB+Dodgers&hl=en-US&gl=US&ceid=US:en",
        category: "mlb",
        sourceName: "Google News",
    },
    gn_ai: {
        url: "https://news.google.com/rss/search?q=AI+large+language+model&hl=en-US&gl=US&ceid=US:en",
        category: "ai",
        sourceName: "Google News",
    },
    gn_shenzhen: {
        url: "https://news.google.com/rss/search?q=Shenzhen+Guangdong+news&hl=en-US&gl=US&ceid=US:en",
        category: "shenzhen",
        sourceName: "Google News",
    },
    gn_worldcup: {
        url: "https://news.google.com/rss/search?q=World+Cup+2026&hl=en-US&gl=US&ceid=US:en",
        category: "football",
        sourceName: "Google News",
    },
    gn_wtt: {
        url: "https://news.google.com/rss/search?q=WTT+table+tennis&hl=en-US&gl=US&ceid=US:en",
        category: "tabletennis",
        sourceName: "Google News",
    },
    gn_ttcn: {
        url: "https://news.google.com/rss/search?q=China+table+tennis&hl=en-US&gl=US&ceid=US:en",
        category: "tabletennis",
        sourceName: "Google News",
    },
    motorsport: {
        url: "https://www.motorsport.com/rss/f1/news/",
        category: "f1",
        sourceName: "Motorsport.com",
    },
};

async function fetchRssFeed(feedKey: string, options?: FetchOptions): Promise<BriefNewsLike[]> {
    const config = RSS_FEEDS[feedKey];
    if (!config) throw new Error(`Unknown RSS feed: ${feedKey}`);

    try {
        const xml = await fetchText(config.url, options);
        const rawItems = extractRss(xml);
        // Override category from feed config
        for (const item of rawItems) {
            item.category = config.category;
        }

        // Collect URLs to resolve (limit to MAX_DECODE_ITEMS)
        const limit = options?.fetch_max_decode_items ?? MAX_DECODE_ITEMS;
        const urlsToResolve = rawItems.slice(0, limit).map((item) => item.url);
        const resolved = await resolveGoogleNewsUrls(urlsToResolve, options);

        const results: BriefNewsLike[] = [];
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i]!;
            if (i < resolved.length) {
                const result = resolved[i]!;
                if (result.status === "ok" && result.url) {
                    item.url = result.url;
                } else if (result.status === "error") {
                    continue; // Skip items with failed Google News URL resolution
                }
                // "passthrough": keep original URL (already a direct link)
            } else {
                // Beyond resolution limit — skip if it's a Google News wrapper
                if (articleToken(item.url) !== null) continue;
            }

            // Validate that the final URL is a plausible article URL (skip if not)
            if (item.url && !isArticleUrl(item.url)) continue;

            results.push(toBriefNews(item, config.sourceName));
        }
        return results;
    } catch (error) {
        if (error instanceof Error) {
            logExpectedError(error);
            return [];
        }
        throw error;
    }
}

// ─── Category Mapping & Unified Entry ────────────────────────

type SourceFetcher = (options?: FetchOptions) => Promise<BriefNewsLike[]>;

const CATEGORY_SOURCES: Record<NewsCategory, SourceFetcher[]> = {
    international: [
        fetchBbc,
        fetchCnnWorld,
        fetchCnnSport,
        (opts) => fetchRssFeed("gn_international", opts),
    ],
    football: [
        fetchBbcSport,
        (opts) => fetchRssFeed("gn_worldcup", opts),
    ],
    realmadrid: [
        (opts) => fetchRssFeed("managing_madrid", opts),
        (opts) => fetchRssFeed("as_realmadrid", opts),
        (opts) => fetchRssFeed("marca_realmadrid", opts),
        (opts) => fetchRssFeed("gn_realmadrid", opts),
    ],
    f1: [
        fetchF1,
        fetchRacefans,
        fetchBbcSport,
        (opts) => fetchRssFeed("gn_f1", opts),
        (opts) => fetchRssFeed("motorsport", opts),
    ],
    ai: [
        fetchTechcrunch,
        (opts) => fetchRssFeed("gn_ai", opts),
    ],
    mlb: [
        (opts) => fetchRssFeed("gn_mlb", opts),
    ],
    shenzhen: [
        fetchThepaper,
        fetchNfnews,
        (opts) => fetchRssFeed("gn_shenzhen", opts),
    ],
    tabletennis: [
        (opts) => fetchRssFeed("gn_wtt", opts),
        (opts) => fetchRssFeed("gn_ttcn", opts),
    ],
};

interface FetchArguments {
    category: NewsCategory,
    options: FetchOptions
}

/**
 * Fetch all news for a given category from every related source.
 * Sources run concurrently. Expected errors per source yield empty results
 * without affecting other sources. Results are deduplicated by canonical URL.
 */
export async function fetchNewsByCategory({ category, options }: FetchArguments): Promise<Map<string, BriefNewsLike>> {
    const sources = CATEGORY_SOURCES[category];
    if (!sources) {
        throw new TypeError(`Invalid or unsupported category: ${category}`);
    }

    const settled = await Promise.allSettled(sources.map((fn) => fn(options)));
    const allNews = new Map<string, BriefNewsLike>();
    const seenUrls = new Set<string>();

    for (const result of settled) {
        if (result.status === "rejected") {
            // Bubble up unexpected internal errors
            throw result.reason;
        }
        for (const news of result.value) {
            // Filter by requested category (some sources return mixed categories)
            if (news.category !== category) continue;
            const canonical = canonicalUrl(news.url);
            if (canonical && seenUrls.has(canonical)) continue;
            if (canonical) seenUrls.add(canonical);
            allNews.set(news.hash_id, news);
        }
    }
    return allNews;
}
