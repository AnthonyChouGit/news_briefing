
export interface AIClient {
    ask(prompt: string): Promise<string>;
    clearContext(): void;
}