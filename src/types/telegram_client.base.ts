export type TelegramParseMode = "MarkdownV2" | "HTML" | "Markdown";

export abstract class TelegramClient {
    abstract sendMessage(channel: string, message: string, options?: { parse_mode?: TelegramParseMode }): Promise<void>;
}