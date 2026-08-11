import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";

const MergeStatusInputSchema = (status_names: string[]): z.ZodObject<Record<string, z.ZodBoolean>> => {
    const schemas: Record<string, z.ZodBoolean> = {};
    status_names.forEach(name => schemas[name] = z.boolean());
    return z.object(schemas);
};
type MergeStatusInput = Record<string, boolean>;

const MergeStatusOutputSchema = z.object({
    fulfilled: z.boolean()
});
type MergeStatusOutput = z.infer<typeof MergeStatusOutputSchema>;

export default async function mergeStatus({ inputs }: OperatorArgs): Promise<OperatorOutput> {
    try {
        for (const [status_name, fulfilled] of Object.entries(inputs as MergeStatusInput)) {
            if (!fulfilled) {
                throw new Error(`Status ${status_name} is not fulfilled`);
            }
        }
        const op_output: MergeStatusOutput = { fulfilled: true };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 8, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class MergeStatusOperator extends Operator {
    name: string = "merge_status";
    input_schema = z.object({});
    output_schemas = { default: MergeStatusOutputSchema, error: ErrorInfoSchema };
    exec = mergeStatus;

    constructor(name: string, status_names: string[], fulfill_name?: string) {
        super(name);
        this.input_schema = MergeStatusInputSchema(status_names);
        if (fulfill_name)
            this.mapOutput("fulfilled", fulfill_name);
    }
}