import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { ErrorHandler } from "../utils/error.js";

const ErrorOutputSchema = z.object({
    success: z.boolean()
});
type ErrorOutput = z.infer<typeof ErrorOutputSchema>;

const ErrorRequiresSchema = z.object({
    error_handler: z.instanceof(ErrorHandler),
});
type ErrorRequires = z.infer<typeof ErrorRequiresSchema>;

export default async function error({ inputs, requires }: OperatorArgs): Promise<OperatorOutput> {
    const { err_code, err_obj } = inputs as ErrorInfo;
    const { error_handler } = requires as ErrorRequires;
    const handler_promise = error_handler.handleError({ err_code, err_obj });
    const err_details = err_obj instanceof Error
        ? (err_obj.stack ?? err_obj.message)
        : String(err_obj);
    const d = new Date(Date.now() + 8 * 3600000);
    const dateStr = d.toISOString().replace("Z", "+08:00");
    console.error(`[${dateStr}] [Fatal Error] Program failed with code ${err_code}: ${err_details}`);
    await handler_promise;
    const op_output: ErrorOutput = { success: false };
    return { branch: "default", output: op_output };
}

export class ErrorOperator extends Operator {
    name: string = "error";
    input_schema = ErrorInfoSchema;
    output_schemas = { default: ErrorOutputSchema };
    requires_schema = ErrorRequiresSchema;
    exec = error;
}