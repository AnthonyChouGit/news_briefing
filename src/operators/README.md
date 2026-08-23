# Operators Reference

This document provides detailed documentation for every operator in the `src/operators/` directory. All operators extend the abstract `Operator` base class defined in [`operator.ts`](../light-dag/operator.ts) and follow a common structure:

- **`input_schema`** — Zod schema describing the operator's expected inputs.
- **`output_schemas`** — A record mapping branch names (e.g. `"default"`, `"error"`) to Zod schemas for that branch's output.
- **`requires_schema`** *(optional)* — Zod schema for external service dependencies (e.g. database clients, thread pools).
- **`options_schema`** *(optional)* — Zod schema for runtime configuration.
- **`exec`** — The async function that performs the operator's work.

Every operator (except `ErrorOperator`) follows a `try/catch` pattern: on success it returns `{ branch: "default", output }`, on failure it returns `{ branch: "error", output }` with an `ErrorInfo` payload (`{ err_code, err_obj }`).

---

## Table of Contents

| Operator | Error Code | Concurrency Model |
|---|:---:|---|
| [FetchNewsOperator](#1-fetchnewsoperator) | 1 | Worker threads via Piscina (`Promise.allSettled`) |
| [DedupeNewsOperator](#2-dedupenewsoperator) | 2 | Concurrent promises per category (`Promise.all`) |
| [TruncateNewsOperator](#3-truncatenewsoperator) | 3 | Synchronous — no concurrency |
| [ReadNewsOperator](#4-readnewsoperator) | 4 | Worker threads via Piscina (`Promise.allSettled`) |
| [SummarizeNewsOperator](#5-summarizenewsoperator) | 5 | Concurrent promises per category (`Promise.all`) |
| [HistoryNewsOperator](#6-historynewsoperator) | 6 | Concurrent promises per category (`Promise.all`) |
| [FormatNewsOperator](#7-formatnewsoperator) | 7 | Synchronous — single `await` call |
| [MergeStatusOperator](#8-mergestatusoperator) | 8 | Synchronous — iterates entries |
| [SaveNewsOperator](#9-savenewsoperator) | 9 | Concurrent promises per category (`Promise.all`) |
| [SendNewsOperator](#10-sendnewsoperator) | 10 | Concurrent promises per channel (`Promise.allSettled`) |
| [FilterRecencyOperator](#11-filterrecencyoperator) | 11 | Synchronous — iterates entries |
| [ErrorOperator](#12-erroroperator) | — | Synchronous — logs and returns |

---

## 1. FetchNewsOperator

**File:** [`fetchNews.operator.ts`](./fetchNews.operator.ts)  
**Name:** `fetch_news`  
**Error Code:** `1`

### Purpose

Fetches raw news articles from external sources across one or more categories. This is typically the first operator in the pipeline.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `categories: NewsCategory[]` (non-empty) |
| **Output (default)** | `fetched_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 1, err_obj }` |
| **Requires** | `thread_pool: Piscina` |
| **Options** | `FetchOptions` (fetch configuration such as timeouts, retries, etc.) |

### Behavior

1. Destructures `categories` from inputs and `thread_pool` from requires.
2. Calls `fetchAllCategories(categories, thread_pool, fetch_options)` which:
   - Dispatches **one Piscina worker thread task per category** via `pool.run()`, executing the `fetchNewsByCategory` function from `workers/_fetch.js` in a separate worker thread.
   - Automatically filters out paywalled and anti-bot protected domains (e.g. `reuters.com`, `wsj.com`, `bloomberg.com`, `ft.com`, `nytimes.com`, `cepr.org`, `dazn.com`, `news.qq.com`) via `BLOCKED_HOSTS` validation in `isArticleUrl`.
   - Awaits all tasks with `Promise.allSettled` — individual category failures are logged and skipped, not fatal.
   - Throws only if **all** categories fail to fetch.
3. Returns the aggregated `Map<NewsCategory, Map<string, BriefNewsLike>>`.

### Concurrency Model

**Worker threads (true parallelism).** Each category is fetched in a separate OS thread via Piscina's worker thread pool. This bypasses the single-threaded nature of Node.js for CPU-bound parsing and I/O-bound HTTP requests. Uses `Promise.allSettled` for fault tolerance — partial success is acceptable.

---

## 2. DedupeNewsOperator

**File:** [`dedupeNews.operator.ts`](./dedupeNews.operator.ts)  
**Name:** `dedupe_news`  
**Error Code:** `2`

### Purpose

Removes duplicate news articles by comparing newly fetched items against previously covered history items as well as detecting duplicates within the newly fetched items themselves. Uses two deduplication strategies: exact ID matching and AI-powered semantic event matching.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `dedupe_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>`, `history_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `deduped_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 2, err_obj }` |
| **Requires** | `ai_client: AIClient` |

### Behavior

1. For each category in `dedupe_input_items`:
   - **`dedupeById`** — Synchronous. If category exists in history, removes items whose `hash_id` already exists in the history.
   - **`dedupeByEvent`** — Async. Sends the remaining items and history to the AI client with a carefully crafted prompt. The AI identifies articles covering the **same real-world event** (both against history and among fetched items from multiple sources or development stages). For intra-fetched duplicates, it keeps the single latest item with the latest development stage. Returns hash IDs of redundant articles parsed through `jsonrepair` and validated with Zod, which are then deleted from the map.
2. Returns the original `dedupe_input_items` map (mutated in place).

### Concurrency Model

**Concurrent promises (single-threaded).** Creates one promise per category and awaits them all with `Promise.all`. Each promise involves a synchronous `dedupeById` step followed by an async `dedupeByEvent` AI call. Since these run on the main event loop, they share a single thread but overlap on I/O wait (the AI API calls). Note: `Promise.all` is used here, so **a single category failure will reject the entire batch**.

> **Mutation note:** This operator mutates `dedupe_input_items` in place and returns it as `deduped_items`. The input and output reference the same Map object.

---

## 3. TruncateNewsOperator

**File:** [`truncateNews.operator.ts`](./truncateNews.operator.ts)  
**Name:** `truncate_news` (or renamed via `.setName()`)  
**Error Code:** `3`

### Purpose

Limits the number of articles per category to a configurable maximum using random selection. In the pipeline DAG, it is utilized in two distinct phases:
1. **`pre_read_truncate_news`:** Limits items after deduplication before full article reading (`readNews`) to minimize scraping load and bandwidth.
2. **`post_summarize_truncate_news`:** Further limits items after AI summarization to curate the final digest length per category before formatting and delivery.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `truncate_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `truncated_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 3, err_obj }` |
| **Options** | `truncate_max_items_per_category: number` (positive integer), `debug: boolean` (default: `false`) |

### Behavior

1. Iterates over every category in `truncate_input_items`.
2. If a category has ≤ `truncate_max_items_per_category` items, it is passed through unchanged.
3. Otherwise, randomly picks `truncate_max_items_per_category` items via `randomTruncate`.
4. Returns a **new** Map (the input is not mutated).

### Concurrency Model

**Synchronous — no concurrency.** All work is performed in a single synchronous `Array.from` + iteration. No promises, no threads.

---

## 4. ReadNewsOperator

**File:** [`readNews.operator.ts`](./readNews.operator.ts)  
**Name:** `read_news`  
**Error Code:** `4`

### Purpose

Fetches the full article content (body text) for each previously-fetched brief news item. This enriches the `BriefNewsLike` items with their `raw` article text.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `read_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `read_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 4, err_obj }` |
| **Requires** | `thread_pool: Piscina` |
| **Options** | `ReadOptions` (read configuration) |

### Behavior

1. Dispatches **one Piscina worker thread task per category** via `pool.run()`, executing the `readNewsDetails` function from `workers/_read.js`.
2. Uses modern browser header emulation (`sec-ch-ua`, `sec-fetch-*`, etc.) to reliably retrieve article bodies across various news sites.
3. Awaits all tasks with `Promise.allSettled` — individual category failures are logged; the failed category is removed from the map.
4. Throws only if **all** categories fail.
5. Returns the enriched map (mutated in place — the input map is the same object as the output).

### Concurrency Model

**Worker threads (true parallelism).** Identical concurrency model to `FetchNewsOperator`. Each category's articles are read in a separate OS thread via Piscina. Uses `Promise.allSettled` for fault tolerance.

> **Mutation note:** The `readNews` function mutates the input `read_input_items` map in place (deleting failed categories, replacing entries with enriched items).

---

## 5. SummarizeNewsOperator

**File:** [`summarizeNews.operator.ts`](./summarizeNews.operator.ts)  
**Name:** `summarize_news`  
**Error Code:** `5`

### Purpose

Generates AI-written bullet-point summaries and rewritten titles for each article in a specified language. Applies strict content quality filtering to omit low-quality/boilerplate articles.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `summarize_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `summarized_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 5, err_obj }` |
| **Requires** | `ai_client: AIClient` |
| **Options** | `language: Language` (default: `'English'`), `summarize_min_chars: number`, `summarize_max_chars: number`, `summarize_min_bullets: number`, `summarize_max_bullets: number`, `debug: boolean` (default: `false`) |

### Behavior

1. Creates one promise per category by calling `summarizeEvents(items, ai_client, summarize_options)`.
2. Each `summarizeEvents` call:
   - Evaluates each article's `raw` content against a strict content quality filter (excluding headline repetitions, paywall/cookie notices, video placeholders, and articles with fewer than ~50 words of body content).
   - Sends the remaining candidate articles to the AI client with detailed journalistic and formatting instructions (including strict quote escaping, character limits per bullet point, bullet count limits, and pre-return JSON syntax validation).
   - Expects the AI to return a JSON object with rewritten titles and bullet points (between `summarize_min_bullets` and `summarize_max_bullets`, each between `summarize_min_chars` and `summarize_max_chars` characters) per article matching original `hash_id`s.
   - Automatically repairs malformed JSON syntax using `jsonrepair` and validates the parsed structure with a strict Zod schema.
   - Builds a new Map containing only the successfully summarized articles with their updated titles and bullets.
3. Awaits all category promises with `Promise.all`.
4. Returns a new `Map<NewsCategory, Map<string, BriefNewsLike>>` containing only articles that passed the quality filter and summarization.

### Concurrency Model

**Concurrent promises (single-threaded).** One AI API call per category, all fired concurrently via `Promise.all`. The promises overlap on network I/O but share the main thread. Uses `Promise.all` — **a single category failure rejects the entire batch**.

---

## 6. HistoryNewsOperator

**File:** [`historyNews.operator.ts`](./historyNews.operator.ts)  
**Name:** `history_news`  
**Error Code:** `6`

### Purpose

Fetches previously reported news articles from a database (TypeORM repository) within a configurable time window. The results are used downstream by the dedupe operator.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `categories: NewsCategory[]` (non-empty) |
| **Output (default)** | `history_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 6, err_obj }` |
| **Requires** | `repository: Repository<BriefNews>` |
| **Options** | `time_window_days: number` (positive, default: `3`), `debug: boolean` (default: `false`) |

### Behavior

1. Creates one promise per category.
2. Each promise queries the database directly via `repository.find()` for all `BriefNews` entities matching the category whose `source_date` is within the last `time_window_days` days.
3. Awaits all promises with `Promise.all`.
4. Assembles the results into a new `Map<NewsCategory, Map<string, BriefNewsLike>>`.

### Concurrency Model

**Concurrent promises (single-threaded).** One database query per category, all fired concurrently via `Promise.all`. The promises overlap on I/O but share the main thread. Uses `Promise.all` — **a single category failure rejects the entire batch**.

---

## 7. FormatNewsOperator

**File:** [`formatNews.operator.ts`](./formatNews.operator.ts)  
**Name:** `format_news`  
**Error Code:** `7`

### Purpose

Converts the structured news data into a formatted string ready for delivery. The current implementation formats for Telegram MarkdownV2. Also provided as `FormatNewsOperatorThread` for execution within worker threads.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `format_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `news_text: string` (non-empty) |
| **Output (error)** | `ErrorInfo { err_code: 7, err_obj }` |
| **Options** | `language: Language` (default: `'English'`), `time_zone?: string`, `debug: boolean` (default: `false`) |

### Behavior

1. Calls `formatTelegramMarkdown(format_input_items, options)` which:
   - Builds a localized date header from the current timestamp and configured timezone.
   - Sorts categories in a preferred display order.
   - For each category, sorts articles by date (newest first) and renders them as Telegram MarkdownV2 with:
     - Category emoji + localized label as a bold header.
     - Each article as `• *Title* Date [Source](url)` with indented bullet points.
   - Escapes all special MarkdownV2 characters.
2. Returns the formatted string (`news_text`).

### Concurrency Model

**Synchronous — no concurrency.** The formatting is synchronous. All string construction happens on the main thread in a single call (or within a worker thread when using `FormatNewsOperatorThread`).

---

## 8. MergeStatusOperator

**File:** [`mergeStatus.operator.ts`](./mergeStatus.operator.ts)  
**Name:** Configurable via constructor (default: `"merge_status"`)  
**Error Code:** `8`

### Purpose

A control-flow operator that acts as a synchronization barrier. It checks whether all upstream boolean status flags are `true`, allowing the pipeline to proceed only when all required preconditions are met.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | Dynamic — constructed at instantiation from `status_names`. Each key is a `string` status name mapped to a `z.boolean()`. |
| **Output (default)** | `fulfilled: boolean` |
| **Output (error)** | `ErrorInfo { err_code: 8, err_obj }` |

### Behavior

1. Iterates over all entries in `inputs` (cast as `Record<string, boolean>`).
2. If any status is `false`, throws an `Error` indicating which status is not fulfilled.
3. If all statuses are `true`, returns `{ fulfilled: true }`.
4. The constructor accepts an optional `fulfill_name` parameter; if provided, it maps the `"fulfilled"` output key to that name via `mapOutput`, allowing downstream operators to read the status under a custom key.

### Concurrency Model

**Synchronous — no concurrency.** Iterates over a plain object's entries. No promises, no threads.

### Constructor

```typescript
constructor(name: string, status_names: string[], fulfill_name?: string)
```

- `name` — Overrides the operator name (allows multiple instances in a DAG).
- `status_names` — The list of boolean input field names the operator will check.
- `fulfill_name` — Optional. If provided, maps the `"fulfilled"` output to this name in the global state.

---

## 9. SaveNewsOperator

**File:** [`saveNews.operator.ts`](./saveNews.operator.ts)  
**Name:** `save_news`  
**Error Code:** `9`

### Purpose

Persists the processed news items to a database (TypeORM repository) for future deduplication.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `save_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `saved: boolean` (default: `true`) |
| **Output (error)** | `ErrorInfo { err_code: 9, err_obj }` |
| **Requires** | `repository: Repository<BriefNews>` |
| **Options** | `debug: boolean` (default: `false`) |

### Behavior

1. Creates one promise per category.
2. Inside each promise:
   - Converts the `BriefNewsLike` map values into TypeORM entities via `repository.create()`.
   - Persists them with `repository.save()`.
3. Awaits all promises with `Promise.all`.
4. Returns `{ saved: true }`.

### Concurrency Model

**Concurrent promises (single-threaded).** One database write per category, all fired concurrently via `Promise.all`. Overlaps on I/O. Uses `Promise.all` — **a single category failure rejects the entire batch**.

---

## 10. SendNewsOperator

**File:** [`sendNews.operator.ts`](./sendNews.operator.ts)  
**Name:** `send_news`  
**Error Code:** `10`

### Purpose

Delivers the formatted news text to one or more Telegram channels.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `news_text: string` (non-empty), `channels: string[]` (non-empty) |
| **Output (default)** | `sent: boolean` (default: `true`) |
| **Output (error)** | `ErrorInfo { err_code: 10, err_obj }` |
| **Requires** | `send_client: TelegramClient` |
| **Options** | `send_parse_mode: TelegramParseMode` (default: `"MarkdownV2"`), `send_chunk_size: number` (default: `4000`), `debug: boolean` (default: `false`) |

### Behavior

1. Creates one promise per channel by calling `send_client.sendMessage(channel, news_text, { parse_mode, chunk_size })`.
2. Awaits all promises with `Promise.allSettled`.
3. Iterates over results — logs rejected sends as expected errors via `logExpectedError` but does **not** throw.
4. Returns `{ sent: true }` regardless of individual channel failures.

### Concurrency Model

**Concurrent promises (single-threaded).** One Telegram API call per channel, all fired concurrently via `Promise.allSettled`. This is the only operator that uses `allSettled` at the operator level (vs. at the utility level). Individual channel failures are logged but tolerated — the operator always succeeds unless an unexpected exception occurs.

---

## 11. FilterRecencyOperator

**File:** [`filterRecency.operator.ts`](./filterRecency.operator.ts)  
**Name:** Configurable via constructor (default: `"filter_recency"`)  
**Error Code:** `11`

### Purpose

Filters news articles based on their publication date (`source_date`), removing any articles that are older than a configurable time threshold (in hours). Typically used post-fetch and post-read to ensure only fresh news items proceed through the pipeline.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `filter_recency_input_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (default)** | `filtered_recency_items: Map<NewsCategory, Map<string, BriefNewsLike>>` |
| **Output (error)** | `ErrorInfo { err_code: 11, err_obj }` |
| **Options** | `filter_recency_td_hours: number` (positive number, default: `24`), `debug: boolean` (default: `false`) |

### Behavior

1. Computes the cutoff threshold: `earliest = new Date(Date.now() - filter_recency_td_hours * 60 * 60 * 1000)`.
2. Iterates over all categories and their items in `filter_recency_input_items`.
3. Deletes any article whose `source_date` is earlier than `earliest`.
4. Returns the filtered map (mutated in place).

### Concurrency Model

**Synchronous — no concurrency.** Iterates synchronously over in-memory Map entries. No promises, no threads.

### Constructor

```typescript
constructor(name: string = "filter_recency", input_map?: Record<string, string>, output_map?: Record<string, string>)
```

- `name` — Overrides the operator name (allows multiple instances such as `"post_fetch_filter_td"` and `"post_read_filter_td"` in a DAG).
- `input_map` — Optional input task name mappings.
- `output_map` — Optional output task name mappings.

---

## 12. ErrorOperator

**File:** [`error.operator.ts`](./error.operator.ts)  
**Name:** `error`  
**Error Code:** N/A (this is the error handler)

### Purpose

Terminal error handler. Logs the error that caused a pipeline failure, sends error notifications through the configured `ErrorHandler`, and returns a `{ success: false }` signal.

### Schemas

| Schema | Fields |
|---|---|
| **Input** | `ErrorInfo { err_code: number, err_obj: unknown }` |
| **Output (default)** | `success: boolean` |
| **Requires** | `error_handler: ErrorHandler` |

### Behavior

1. Destructures `err_code` and `err_obj` from inputs.
2. Extracts a human-readable message from `err_obj` (`.message` if it's an `Error`, otherwise `String()`).
3. Constructs a UTC+8 timestamp.
4. Dispatches error notification via `error_handler.handleError({ err_code, err_obj })`.
5. Logs `[timestamp] [Fatal Error] Program failed with code <err_code>: <message>` to `stderr`.
6. Returns `{ success: false }`.

### Concurrency Model

**Synchronous / Async error notification.** Dispatches error handling to the `ErrorHandler` and returns `{ success: false }`.

### Notes

- This operator has **no error branch** in its `output_schemas` — it is the terminal sink for errors.
- The timestamp is formatted in UTC+8.

---

## Concurrency Summary

None of the operators spawn actual OS threads directly. Thread-level parallelism is achieved exclusively through **Piscina**, a worker thread pool library. The remaining concurrency is standard Node.js **promise-based concurrency** (cooperative multitasking on the single event loop).

| Strategy | Operators | True Parallelism? | Fault Tolerance |
|---|---|:---:|---|
| **Piscina worker threads** (`Promise.allSettled`) | `fetchNews`, `readNews`, `formatNews` *(thread variant)* | ✅ Yes | Partial failures tolerated |
| **`Promise.all`** (concurrent async) | `dedupeNews`, `summarizeNews`, `historyNews`, `saveNews` | ❌ No (event loop) | All-or-nothing (one failure rejects all) |
| **`Promise.allSettled`** (concurrent async) | `sendNews` | ❌ No (event loop) | Partial failures tolerated |
| **Synchronous** | `truncateNews`, `formatNews` *(sync variant)*, `mergeStatus`, `filterRecency`, `error` | ❌ No | N/A |

### Key distinction

- **Worker threads (Piscina):** Used by `fetchNews` and `readNews` (and optionally `formatNews` via `FormatNewsOperatorThread`). These run JavaScript in separate OS threads, enabling true CPU parallelism. The heavy lifting (HTTP fetching, HTML parsing) happens off the main thread.
- **`Promise.all` / `Promise.allSettled`:** Used by the remaining async operators. These fire multiple async operations concurrently but all execute on the **same** Node.js event loop thread. Concurrency comes from overlapping I/O waits (network calls to AI APIs, database queries, Telegram API), not from parallel computation.

---

## Error Code Registry

| Code | Operator | Typical Cause |
|:---:|---|---|
| 1 | `fetchNews` | All news source categories failed to fetch |
| 2 | `dedupeNews` | AI deduplication call or parsing failure |
| 3 | `truncateNews` | Unexpected input shape or iteration error |
| 4 | `readNews` | All categories failed to read article content |
| 5 | `summarizeNews` | AI summarization call or Zod validation failure |
| 6 | `historyNews` | Database query failure |
| 7 | `formatNews` | Formatting/rendering error |
| 8 | `mergeStatus` | One or more upstream statuses not fulfilled |
| 9 | `saveNews` | Database write failure |
| 10 | `sendNews` | Unexpected error during Telegram send setup |
| 11 | `filterRecency` | Error during date recency filtering |
