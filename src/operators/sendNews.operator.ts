import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { TelegramClient, TelegramParseModeSchema } from "../utils/telegram.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { logExpectedError } from "./common/errors.js";

export const SendNewsOptionsSchema = z.object({
    send_parse_mode: TelegramParseModeSchema.default("MarkdownV2"),
    send_chunk_size: z.coerce.number().positive().default(4000),
    debug: z.coerce.boolean().default(false)
});
export type SendNewsOptions = z.infer<typeof SendNewsOptionsSchema>;

const SendNewsInputSchema = z.object({
    news_text: z.string().nonempty(),
    channels: z.array(z.string().nonempty()).nonempty()
});
type SendNewsInput = z.infer<typeof SendNewsInputSchema>;

const SendNewsOutputSchema = z.object({
    sent: z.boolean().default(true)
});
type SendNewsOutput = z.infer<typeof SendNewsOutputSchema>;

const SendNewsRequiresSchema = z.object({
    send_client: z.instanceof(TelegramClient)
});
type SendNewsRequires = z.infer<typeof SendNewsRequiresSchema>;

export default async function sendNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { news_text, channels } = inputs as SendNewsInput;
        const { send_client } = requires as SendNewsRequires;
        const { send_parse_mode, send_chunk_size, debug } = options as SendNewsOptions;
        const send_promises = channels.map(async (channel: string) => {
            await send_client.sendMessage(channel, news_text, { parse_mode: send_parse_mode, chunk_size: send_chunk_size });
        });
        const send_results = await Promise.allSettled(send_promises);
        let sentCount = 0;
        for (let i = 0; i < channels.length; i++) {
            const result = send_results[i]!;
            if (result.status === "rejected") {
                logExpectedError(`Failed to send news to channel ${channels[i]}: ${result.reason}`);
            } else {
                sentCount++;
            }
        }
        if (debug) {
            console.log(`[SEND] Successfully sent news to ${sentCount}/${channels.length} channels`);
        }
        const op_output: SendNewsOutput = { sent: true };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 10, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class SendNewsOperator extends Operator {
    name: string = "send_news";
    input_schema = SendNewsInputSchema;
    output_schemas = { default: SendNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = SendNewsRequiresSchema;
    options_schema = SendNewsOptionsSchema;
    exec = sendNews;
}