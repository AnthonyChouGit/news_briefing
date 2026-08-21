import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";
import { createOpenAI, type OpenAILanguageModelResponsesOptions, type OpenAIProvider, type OpenAIProviderSettings } from "@ai-sdk/openai";
import { createAnthropic, type AnthropicLanguageModelOptions, type AnthropicProvider, type AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { createOpenAICompatible, type OpenAICompatibleProvider, type OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { generateText, Output, type Instructions, type ModelMessage } from "ai";
import { jsonrepair } from "jsonrepair";

export const AIReasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium");
export type AIReasoningEffort = z.infer<typeof AIReasoningEffortSchema>;

export const AIProviderTypeSchema = z.enum(["openai", "anthropic", "openai-compatible"]);
export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;

export const AIClientConfigSchema = z.object({
    ai_api_key: z.string().nonempty(),
    ai_base_url: z.string().nonempty(),
    ai_model: z.string().nonempty(),
    ai_timeout: z.coerce.number().int().positive().default(300000),
    ai_max_retries: z.coerce.number().int().positive().default(3),
    ai_reasoning_effort: AIReasoningEffortSchema,
    ai_provider_type: AIProviderTypeSchema
});
export type AIClientConfig = z.infer<typeof AIClientConfigSchema>;

export abstract class AIClient {
    abstract ask(prompt: string, instruction?: string): Promise<string>;
    abstract ask<T extends ZodType>(prompt: string, instruction: string | undefined, response_schema: T): Promise<z.infer<T>>;
}

export class OpenAIClient extends AIClient {

    private readonly model: string;
    private readonly client: OpenAI;
    private readonly reasoning_effort: AIReasoningEffort;

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

    ask(prompt: string, instruction?: string): Promise<string>;
    ask<T extends ZodType>(prompt: string, instruction: string | undefined, response_schema: T): Promise<z.infer<T>>;
    public async ask<T extends ZodType>(prompt: string, instruction?: string, response_schema?: T): Promise<any> {
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
        const message = response?.choices?.[0]?.message;
        const content = message?.content;

        if (!message || typeof content !== "string") {
            const errorMessage = message?.refusal || `Unexpected response format from AI: ${JSON.stringify(response)}`;
            throw new Error(errorMessage);
        }
        if (response_schema) {
            return response_schema.parse(JSON.parse(jsonrepair(content)));
        }
        return content;
    }
}

export class AISDKClient extends AIClient {
    private readonly provider: OpenAIProvider | AnthropicProvider | OpenAICompatibleProvider;
    private readonly provider_type: AIProviderType;
    private readonly reasoning_effort: AIReasoningEffort;
    private readonly model: string;
    private readonly timeout: number;
    private readonly max_retries: number;

    constructor(config: AIClientConfig) {
        super();
        this.provider_type = config.ai_provider_type;
        this.reasoning_effort = config.ai_reasoning_effort;
        this.timeout = config.ai_timeout;
        this.max_retries = config.ai_max_retries;
        this.model = config.ai_model;
        const provider_config: OpenAIProviderSettings | AnthropicProviderSettings | OpenAICompatibleProviderSettings = {
            apiKey: config.ai_api_key,
            baseURL: config.ai_base_url,
            name: "openaiCompatible"
        };
        switch (config.ai_provider_type) {
            case "openai":
                this.provider = createOpenAI(provider_config as OpenAIProviderSettings);
                break;
            case "anthropic":
                this.provider = createAnthropic(provider_config as AnthropicProviderSettings);
                break;
            case "openai-compatible":
                this.provider = createOpenAICompatible(provider_config as OpenAICompatibleProviderSettings);
                break;
            default:
                throw new Error(`Unsupported AI provider type: ${config.ai_provider_type}`);
        }
    }

    ask(prompt: string, instruction?: string): Promise<string>;
    ask<T extends ZodType>(prompt: string, instruction: string | undefined, response_schema: T): Promise<z.infer<T>>;
    public async ask<T extends ZodType>(prompt: string, instruction?: string, response_schema?: T): Promise<any> {
        const provider_options = {
            openai: {
                reasoningEffort: this.reasoning_effort
            } satisfies OpenAILanguageModelResponsesOptions,
            anthropic: {
                effort: this.reasoning_effort,
                thinking: { type: "adaptive" }
            } satisfies AnthropicLanguageModelOptions,
            openaiCompatible: {
                reasoningEffort: this.reasoning_effort
            }
        };

        const output_def = response_schema ? { output: Output.object({ schema: response_schema }) } : {};
        const instructions = instruction ? { instructions: instruction } : {};

        const { output, text } = await generateText({
            model: this.provider(this.model),
            prompt: prompt,
            timeout: this.timeout,
            maxRetries: this.max_retries,
            providerOptions: provider_options,
            ...output_def,
            ...instructions
        });
        if (response_schema)
            return response_schema.parse(output);
        if (!text)
            throw new Error("Unexpected response format from AI: null");
        return text;
    }
}