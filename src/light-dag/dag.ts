import { type Piscina } from "piscina";
import { type Operator, type OperatorArgs, type OperatorOutput, OperatorArgsSchema, OperatorOutputSchema } from "./operator.js";

export class LightDag {
    private readonly pool: Piscina | undefined;
    private readonly operators: Map<string, Operator>;
    private readonly task_names: Set<string>;
    private debug: boolean;
    private timeout?: number | undefined;

    constructor(operators: Operator[], worker_pool?: Piscina, debug?: boolean, timeout?: number) {
        this.pool = worker_pool;
        this.debug = debug ?? false;
        this.timeout = timeout;
        this.operators = new Map<string, Operator>();
        this.task_names = new Set<string>();
        for (const op of operators) {
            for (const name of Object.keys(op.input_schema.shape).map(n => op.input_map?.[n] ?? n))
                this.task_names.add(name);
            for (const [, outputs] of Object.entries(op.output_schemas))
                for (const name of Object.keys(outputs.shape).map(n => op.output_map?.[n] ?? n))
                    this.task_names.add(name);
            if (this.operators.has(op.name))
                throw new Error(`Duplicate operator name: "${op.name}"`);
            this.operators.set(op.name, op);
        }
    }

    public setDebug(enabled: boolean): void {
        this.debug = enabled;
    }

    public setTimeout(timeout: number): void {
        this.timeout = timeout;
    }

    private log(...args: unknown[]): void {
        if (this.debug)
            console.log("[LightDag]", ...args);
    }

    public async run(
        inputs: Record<string, unknown>,
        outputs: string[],
        context?: Record<string, unknown>,
        options?: Record<string, Record<string, string | number | boolean>>
    ) {
        if (this.debug) {
            const consumed = new Set<string>();
            const produced = new Set<string>();
            for (const op of this.operators.values()) {
                for (const name of Object.keys(op.input_schema.shape))
                    consumed.add(op.input_map?.[name] ?? name);
                for (const branchSchema of Object.values(op.output_schemas))
                    for (const name of Object.keys(branchSchema.shape))
                        produced.add(op.output_map?.[name] ?? name);
            }
            const provided_inputs = new Set(Object.keys(inputs));
            const requested_outputs = new Set(outputs);
            for (const name of produced) {
                if (!consumed.has(name) && !requested_outputs.has(name))
                    console.warn(`[LightDag] Warning: task "${name}" is produced but never consumed by any operator or requested as output`);
            }
            for (const name of consumed) {
                if (!produced.has(name) && !provided_inputs.has(name))
                    console.warn(`[LightDag] Warning: task "${name}" is consumed but never produced by any operator or provided as input`);
            }
        }
        const tasks = new Map<string, Promise<unknown>>();
        const resolves = new Map<string, { resolve: (value: unknown) => void, reject: (reason: unknown) => void }>();
        for (const task of this.task_names) {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            tasks.set(task, promise);
            resolves.set(task, { resolve, reject });
        }
        this.log("run() started, operators:", [...this.operators.keys()]);
        if (this.timeout)
            setTimeout(() => { throw new Error(`[LightDag] Error: Execution timeout: ${this.timeout}ms`) }, this.timeout);
        for (const op_name of this.operators.keys())
            this.runNode(op_name, tasks, resolves, context, options?.[op_name]);
        for (const [input_name, input_value] of Object.entries(inputs)) {
            const entry = resolves.get(input_name);
            if (!entry)
                throw new Error(`Input "${input_name}" not found`);
            this.log(`resolving input "${input_name}"`);
            entry.resolve(input_value);
        }
        const output_promises = outputs.map((output_name) => {
            const task = tasks.get(output_name);
            if (!task)
                throw new Error(`Requested output "${output_name}" does not exist in the DAG`);
            return task;
        });
        const resolved_outputs = await Promise.all(output_promises);
        const output_values: Record<string, unknown> = {};
        for (let i = 0; i < outputs.length; i++) {
            output_values[outputs[i]!] = resolved_outputs[i];
        }
        this.log("run() completed, outputs:", Object.keys(output_values));
        return output_values;
    }

    private async runNode(
        name: string,
        tasks: Map<string, Promise<unknown>>,
        resolves: Map<string, { resolve: (value: unknown) => void, reject: (reason: unknown) => void }>,
        context?: Record<string, unknown>,
        options?: Record<string, string | number | boolean>
    ): Promise<void> {
        let all_global_output_names: string[] = [];
        try {
            const op = this.operators.get(name);
            if (!op) {
                throw new Error(`Node ${name} not found`);
            }
            for (const branchSchema of Object.values(op.output_schemas))
                for (const key of Object.keys(branchSchema.shape))
                    all_global_output_names.push(op.output_map?.[key] ?? key);
            const schema_input_names = Object.keys(op.input_schema.shape);
            const global_input_names = schema_input_names.map(n => op.input_map?.[n] ?? n);

            const input_results = await Promise.all(
                global_input_names.map(global_name => {
                    const task = tasks.get(global_name);
                    if (!task)
                        throw new Error(`Task "${global_name}" not found for node "${name}"`);
                    return task;
                })
            );
            const inputs: Record<string, unknown> = {};
            for (let i = 0; i < schema_input_names.length; i++) {
                inputs[schema_input_names[i]!] = input_results[i];
            }
            this.log(`operator "${name}" inputs resolved:`, global_input_names);
            const parsed_inputs = op.input_schema.parse(inputs);
            const parsed_requires = op.requires_schema.parse(context);
            const parsed_options = op.options_schema.parse(options);
            let op_output: OperatorOutput;
            const op_input_arg: OperatorArgs = { inputs: parsed_inputs, requires: parsed_requires, options: parsed_options };
            if (typeof op.exec === "string") {
                if (!this.pool)
                    throw new Error(`Worker pool not initialized for node ${name}`);
                op_output = await this.pool.run(op_input_arg, { filename: op.exec });
            } else {
                op_output = await op.exec(op_input_arg);
            }
            op_output = OperatorOutputSchema.parse(op_output);
            if (!Object.hasOwn(op.output_schemas, op_output.branch))
                throw new Error(`Branch "${op_output.branch}" not found for node "${name}"`);
            const parsed_output = op.output_schemas[op_output.branch]!.parse(op_output.output);
            const schema_output_names = Object.keys(op.output_schemas[op_output.branch]!.shape);
            const global_output_names = schema_output_names.map(n => op.output_map?.[n] ?? n);
            for (let i = 0; i < schema_output_names.length; i++) {
                const schema_name = schema_output_names[i]!;
                const global_name = global_output_names[i]!;
                const entry = resolves.get(global_name);
                if (!entry)
                    throw new Error(`Resolve not found for output "${global_name}" in node "${name}"`);
                entry.resolve(parsed_output[schema_name]);
            }
            this.log(`operator "${name}" completed, outputs:`, global_output_names);
        } catch (err) {
            console.error(`Operator "${name}" failed:`, err);
            this.log(`operator "${name}" failed, rejecting outputs:`, all_global_output_names);
            for (const global_name of all_global_output_names) {
                resolves.get(global_name)?.reject(err);
            }
        }
    }
}