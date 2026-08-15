import type { GrammyTelegramClient } from "./telegram.js";
import type { ErrorInfo } from "../operators/common/errors.js";

export abstract class ErrorHandler {
    public abstract handleError(err_info: ErrorInfo): void | Promise<void>;
}

export class TelegramErrorHandler extends ErrorHandler {

    constructor(
        private readonly telegram_client: GrammyTelegramClient,
        private readonly error_channels: string[]
    ) {
        super();
    }

    public async handleError({ err_code, err_obj }: ErrorInfo) {
        let output = `News Briefing Failed with Code ${err_code}`;
        if (err_obj instanceof Error) {
            output += `\nDetails:\n${err_obj.message}\n\n${err_obj.stack ?? "No stack trace available."}`;
        } else {
            output += `\nDetails:\n${String(err_obj)}`;
        }
        const send_promises: Promise<void>[] = this.error_channels.map(async (channel: string) => {
            await this.telegram_client.sendMessage(channel, output);
        });
        const results = await Promise.allSettled(send_promises);
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(`failed to send error message to telegram channel ${this.error_channels[index]}: ${result.reason}`);
            }
        });
    }


}