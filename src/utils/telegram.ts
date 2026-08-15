import * as z from "zod";
import { Bot } from "grammy";

export const TelegramParseModeSchema = z.enum(["MarkdownV2", "HTML", "Markdown"])
export type TelegramParseMode = z.infer<typeof TelegramParseModeSchema>;

export abstract class TelegramClient {
    abstract sendMessage(channel: string, message: string, options?: Record<string, unknown>): Promise<void>;
}


function splitMessage(message: string, maxSize = 4000): string[] {
    if (message.length <= maxSize) return [message];

    const chunks: string[] = [];
    const paragraphs = message.split("\n\n");
    let currentChunk = "";

    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) continue;

        const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
        if (candidate.length <= maxSize) {
            currentChunk = candidate;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }

            if (paragraph.length <= maxSize) {
                currentChunk = paragraph;
            } else {
                const lines = paragraph.split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const lineCandidate = currentChunk ? `${currentChunk}\n${line}` : line;
                    if (lineCandidate.length <= maxSize) {
                        currentChunk = lineCandidate;
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                            currentChunk = "";
                        }
                        if (line.length <= maxSize) {
                            currentChunk = line;
                        } else {
                            const words = line.split(" ");
                            for (const word of words) {
                                const wordCandidate = currentChunk ? `${currentChunk} ${word}` : word;
                                if (wordCandidate.length <= maxSize) {
                                    currentChunk = wordCandidate;
                                } else {
                                    if (currentChunk) {
                                        chunks.push(currentChunk.trim());
                                        currentChunk = "";
                                    }
                                    currentChunk = word;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

export class GrammyTelegramClient extends TelegramClient {
    private readonly bot: Bot;

    constructor(config: { telegram_token: string }) {
        super();
        this.bot = new Bot(config.telegram_token);
    }

    async sendMessage(channel: string, message: string, options?: { parse_mode?: TelegramParseMode, chunk_size?: number }): Promise<void> {
        const parseMode = options?.parse_mode;
        const chunkSize = options?.chunk_size ?? 4000;
        const chunks = splitMessage(message, chunkSize);

        for (let i = 0; i < chunks.length; i++) {
            await this.bot.api.sendMessage(channel, chunks[i]!, {
                ...(parseMode ? { parse_mode: parseMode } : {})
            });
            if (i < chunks.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }
}