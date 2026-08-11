import * as z from "zod";
import { Bot } from "grammy";

export const TelegramParseModeSchema = z.enum(["MarkdownV2", "HTML", "Markdown"])
export type TelegramParseMode = z.infer<typeof TelegramParseModeSchema>;

export abstract class TelegramClient {
    abstract sendMessage(channel: string, message: string, options?: Record<string, unknown>): Promise<void>;
}


export class GrammyTelegramClient extends TelegramClient {
    private readonly bot: Bot;

    constructor(config: { token: string }) {
        super();
        this.bot = new Bot(config.token);
    }

    async sendMessage(channel: string, message: string, options?: { parse_mode?: TelegramParseMode }): Promise<void> {
        const parseMode = options?.parse_mode ?? "MarkdownV2";
        await this.bot.api.sendMessage(channel, message, {
            parse_mode: parseMode,
        });
    }
}