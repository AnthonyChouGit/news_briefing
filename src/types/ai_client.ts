import { type ZodType } from "zod";

export abstract class AIClient {
    abstract ask<T extends ZodType>(prompt: string, response_schema?: T, save_context?: boolean): Promise<string>;
    abstract clearContext(): void;
    abstract setInstruction(instruction: string): void;
}