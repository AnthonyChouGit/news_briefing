import { LightDag } from "./light-dag/dag.js";
import { FetchNewsOperator } from "./operators/fetchNews.operator.js";
import { HistoryNewsOperator } from "./operators/historyNews.operator.js";
import { DedupeNewsOperator } from "./operators/dedupeNews.operator.js";
import { ReadNewsOperator } from "./operators/readNews.operator.js";
import { TruncateNewsOperator } from "./operators/truncateNews.operator.js";
import { SummarizeNewsOperator } from "./operators/summarizeNews.operator.js";
import { ErrorOperator } from "./operators/error.operator.js";
import { SaveNewsOperator } from "./operators/saveNews.operator.js";
import { SendNewsOperator } from "./operators/sendNews.operator.js";
import { MergeStatusOperator } from "./operators/mergeStatus.operator.js";
import { FormatNewsOperatorThread } from "./operators/formatNews.operator.js";

const fetch_news_op = new FetchNewsOperator(); // In: categories  Out: fetched_items

const hist_news_op = new HistoryNewsOperator(); // In: categories Out: history_items

const dedupe_news_op = new DedupeNewsOperator().mapInput("dedupe_input_items", "fetched_items");
// In: fetched_items, history_items Out: deduped_items

const truncate_news_op = new TruncateNewsOperator().mapInput("truncate_input_items", "deduped_items");
// In: deduped_items Out: truncated_items

const read_news_op = new ReadNewsOperator().mapInput("read_input_items", "truncated_items");
// In: truncated_items Out: read_items

const summarize_news_op = new SummarizeNewsOperator().mapInput("summarize_input_items", "read_items");
// In: read_items Out: summarized_items

const format_news_op = new FormatNewsOperatorThread().mapInput("format_input_items", "summarized_items");
// In: summarized_items Out: news_text

const send_news_op = new SendNewsOperator(); // In: news_text, channels Out: sent

const save_news_op = new SaveNewsOperator().mapInput("save_input_items", "summarized_items");
// In: summarized_items Out: saved

const success_merge_op = new MergeStatusOperator("success_merge", ["sent", "saved"], "success");
// In: sent, saved Out: success

const error_op = new ErrorOperator(); // In: err_code err_obj Out: success

export const news_briefing_dag = new LightDag([
    fetch_news_op,
    hist_news_op,
    dedupe_news_op,
    truncate_news_op,
    read_news_op,
    summarize_news_op,
    format_news_op,
    send_news_op,
    save_news_op,
    success_merge_op,
    error_op
]);