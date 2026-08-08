import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";

const ErrorOutputSchema = z.object({
    success: z.boolean()
});
type ErrorOutput = z.infer<typeof ErrorOutputSchema>;

export default async function error({ inputs }: OperatorArgs): Promise<OperatorOutput> {
    const { err_code, err_obj } = inputs as ErrorInfo;
    const err_msg = err_obj instanceof Error ? err_obj.message : String(err_obj);
    const d = new Date(Date.now() + 8 * 3600000);
    const dateStr = d.toISOString().replace("Z", "+08:00");
    console.error(`[${dateStr}] [Fatal Error] Program failed with code ${err_code}: ${err_msg}`);
    const op_output: ErrorOutput = { success: false };
    return { branch: "default", output: op_output };
}

export class ErrorOperator extends Operator {
    name: string = "error";
    input_schema = ErrorInfoSchema;
    output_schemas = { default: ErrorOutputSchema };
    exec = error;
}