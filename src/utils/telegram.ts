import { TelegramClient, type TelegramParseMode } from "../types/telegram_client.base.js";
import { Bot } from "grammy";

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