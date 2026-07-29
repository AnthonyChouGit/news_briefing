import { type ZodType } from "zod";

export interface AIClient {
    ask<T extends ZodType>(prompt: string, response_schema?: T): Promise<string>;
    clearContext(): void;
    setInstruction(instruction: string): void;
}