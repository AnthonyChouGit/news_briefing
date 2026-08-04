import OpenAI from "openai";
import { AIClient } from "../types/ai_client.js";
import { zodResponseFormat } from "openai/helpers/zod";
import { type ZodType } from "zod";
import { AICientConfigSchema, type AICientConfig } from "../types/config.schema.js";

export class OpenAIClient extends AIClient {

    private readonly model: string;
    private readonly client: OpenAI;

    constructor(config: AICientConfig) {
        super();
        const valid_config = AICientConfigSchema.parse(config);
        this.client = new OpenAI({
            apiKey: valid_config.api_key,
            baseURL: valid_config.base_url,
            timeout: valid_config.timeout,
            maxRetries: valid_config.max_retries
        });
        this.model = valid_config.model;
    }

    public async ask<T extends ZodType>(prompt: string, instruction?: string, response_schema?: T): Promise<string> {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        if (instruction) {
            messages.push({ role: "system", content: instruction });
        }
        messages.push({ role: "user", content: prompt });
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: messages,
            ...(response_schema ? { response_format: zodResponseFormat(response_schema, "Response Schema") } : {})
        });
        // console.log("RAW RESPONSE:", JSON.stringify(response, null, 2));
        const message = response?.choices?.[0]?.message;
        const content = message?.content;

        if (!message || typeof content !== "string") {
            const errorMessage = message?.refusal || `Unexpected response format from AI: ${JSON.stringify(response)}`;
            throw new Error(errorMessage);
        }
        return content;
    }
}

