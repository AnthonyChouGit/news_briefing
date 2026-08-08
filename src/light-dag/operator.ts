import { type ZodObject, z } from "zod";

export const OperatorArgsSchema = z.object({
    inputs: z.record(z.string(), z.unknown()).default({}),
    requires: z.record(z.string(), z.unknown()).default({}),
    options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.undefined()])).default({})
});
export type OperatorArgs = z.infer<typeof OperatorArgsSchema>;

export const OperatorOutputSchema = z.object({
    branch: z.string().nonempty(),
    output: z.record(z.string(), z.unknown())
});
export type OperatorOutput = z.infer<typeof OperatorOutputSchema>;

export abstract class Operator {
    name: string = "operator";
    abstract input_schema: ZodObject;
    abstract output_schemas: Record<string, ZodObject>;
    requires_schema: z.ZodType<Record<string, unknown>> = z.object({}).default({});
    options_schema: z.ZodType<Record<string, string | number | boolean | undefined>> = z.object({}).default({});
    input_map?: Record<string, string>;
    output_map?: Record<string, string>;
    abstract exec:
        | ((args: OperatorArgs) => Promise<OperatorOutput>)
        | string;

    public mapInput(schema_name: string, global_name: string): void {
        if (!this.input_map)
            this.input_map = {};
        this.input_map[schema_name] = global_name;
    }

    public mapOutput(schema_name: string, global_name: string): void {
        if (!this.output_map)
            this.output_map = {};
        this.output_map[schema_name] = global_name;
    }

    constructor(name?: string, input_map?: Record<string, string>, output_map?: Record<string, string>) {
        if (name)
            this.name = name;
        if (input_map)
            this.input_map = input_map;
        if (output_map)
            this.output_map = output_map;
    }
}