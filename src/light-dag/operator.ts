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

export abstract class Operator {
    abstract name: string;
    abstract input_schema: ZodObject;
    abstract output_schemas: Record<string, ZodObject>;
    abstract requires_schema: ZodObject;
    abstract options_schema: z.ZodType<Record<string, string | number | boolean | undefined>>;
    inputMap?: Record<string, string>;
    outputMap?: Record<string, string>;
    abstract exec:
    | ((args: OperatorArgs) => Promise<OperatorOutput>)
    | string;
}