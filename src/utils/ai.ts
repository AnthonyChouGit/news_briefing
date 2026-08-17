import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { type ZodType } from "zod";
import { type AIClientConfig } from "./config.js";

export abstract class AIClient {
    abstract ask<T extends ZodType>(prompt: string, instruction?: string, response_schema?: T): Promise<string>;
}

export class OpenAIClient extends AIClient {

    private readonly model: string;
    private readonly client: OpenAI;
    private readonly reasoning_effort: "low" | "medium" | "high";

    constructor(config: AIClientConfig) {
        super();
        this.client = new OpenAI({
            apiKey: config.ai_api_key,
            baseURL: config.ai_base_url,
            timeout: config.ai_timeout,
            maxRetries: config.ai_max_retries
        });
        this.model = config.ai_model;
        this.reasoning_effort = config.ai_reasoning_effort;
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
            ...(response_schema ? { response_format: zodResponseFormat(response_schema, "response_schema") } : {}),
            ...(this.reasoning_effort ? { reasoning_effort: this.reasoning_effort } : {})
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

