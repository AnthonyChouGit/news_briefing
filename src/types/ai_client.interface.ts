import { type ZodType } from "zod";

export interface AIClient {
    ask<T extends ZodType>(prompt: string, response_schema?: T, save_context?: boolean): Promise<string>;
    clearContext(): void;
    setInstruction(instruction: string): void;
}