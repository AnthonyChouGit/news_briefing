import { type ZodObject } from "zod";

export interface OperatorArgs {
    inputs: Record<string, unknown>;
    requires: Record<string, unknown>;
    options?: Record<string, unknown>;
}

export interface Operator {
    name: string;
    inputs: ZodObject;
    outputs: ZodObject;
    requires: ZodObject;
    options: ZodObject;
    exec:
    | ((args: OperatorArgs) => Record<string, unknown> | Promise<Record<string, unknown>>)
    | string;
}