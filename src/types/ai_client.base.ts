import { type ZodType } from "zod";

export abstract class AIClient {
    abstract ask<T extends ZodType>(prompt: string, instruction?: string, response_schema?: T): Promise<string>;
}