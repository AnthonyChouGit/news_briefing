import OpenAI from "openai";
import { type AIClient } from "../types/ai_client.interface.js";
import { zodResponseFormat } from "openai/helpers/zod";
import { type ZodType } from "zod";

export class OpenAIClient implements AIClient {

    private readonly model: string;
    private readonly client: OpenAI;
    private readonly instruction: string | undefined;
    private context: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    constructor(api_key: string, base_url: string, model: string, instruction?: string) {
        this.client = new OpenAI({
            apiKey: api_key,
            baseURL: base_url,
            timeout: 300000, // 5 minutes
            maxRetries: 3
        });
        this.model = model;
        this.instruction = instruction;
        this.clearContext();
    }

    public async ask<T extends ZodType>(prompt: string, response_schema?: T): Promise<string> {
        this.context.push({ role: "user", content: prompt });
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: this.context,
            ...(response_schema ? { response_format: zodResponseFormat(response_schema, "Response Schema") } : {})
        });
        // console.log("RAW RESPONSE:", JSON.stringify(response, null, 2));
        const message = response?.choices?.[0]?.message;
        const content = message?.content;

        if (!message || typeof content !== "string") {
            const errorMessage = message?.refusal || `Unexpected response format from AI: ${JSON.stringify(response)}`;
            throw new Error(errorMessage);
        }

        this.context.push(message);
        return content;
    }

    public clearContext(): void {
        this.context = [];
        if (this.instruction)
            this.context.push({ role: "system", content: this.instruction });
    }
}

