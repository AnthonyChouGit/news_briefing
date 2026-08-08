import * as z from "zod";

export const TelegramParseModeSchema = z.enum(["MarkdownV2", "HTML", "Markdown"])
export type TelegramParseMode = z.infer<typeof TelegramParseModeSchema>;

export abstract class TelegramClient {
    abstract sendMessage(channel: string, message: string, options?: { parse_mode?: TelegramParseMode }): Promise<void>;
}