import { type ZodObject, z } from "zod";

export const OperatorArgsSchema = z.object({
    inputs: z.record(z.string(), z.unknown()).default({}),
    requires: z.record(z.string(), z.unknown()).default({}),
    options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
});
export type OperatorArgs = z.infer<typeof OperatorArgsSchema>;

export const OperatorOutputSchema = z.object({
    branch: z.string().nonempty(),
    output: z.record(z.string(), z.unknown())
});
export type OperatorOutput = z.infer<typeof OperatorOutputSchema>;

export interface Operator {
    name: string;
    input_schema: ZodObject;
    output_schemas: Record<string, ZodObject>;
    requires_schema: ZodObject;
    options_schema: ZodObject;
    inputMap?: Record<string, string>;
    outputMap?: Record<string, string>;
    exec:
    | ((args: OperatorArgs) => Promise<OperatorOutput>)
    | string;
}