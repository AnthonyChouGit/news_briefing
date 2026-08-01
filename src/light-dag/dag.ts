import { type Piscina } from "piscina";
import { type Operator } from "./operator.js";

export class LightDag {
    private readonly pool: Piscina | undefined;
    private readonly operators: Map<string, Operator>;
    private readonly task_names: Set<string>;
    private debug = false;

    constructor(operators: Operator[], worker_pool?: Piscina) {
        this.pool = worker_pool;
        this.operators = new Map<string, Operator>();
        this.task_names = new Set<string>();
        for (const op of operators) {
            const input_names = Object.keys(op.inputs.shape);
            const output_names = new Set(Object.keys(op.outputs.shape));
            const self_cycle = input_names.filter(name => output_names.has(name));
            if (self_cycle.length > 0)
                throw new Error(`Operator "${op.name}" consumes its own output(s): ${self_cycle.join(", ")}`);
            for (const name of input_names)
                this.task_names.add(name);
            for (const name of output_names)
                this.task_names.add(name);
            if (this.operators.has(op.name))
                throw new Error(`Duplicate operator name: "${op.name}"`);
            this.operators.set(op.name, op);
        }
    }

    public setDebug(enabled: boolean): void {
        this.debug = enabled;
    }

    private log(...args: unknown[]): void {
        if (this.debug)
            console.log("[LightDag]", ...args);
    }

    public async run(
        inputs: Record<string, unknown>,
        context: Record<string, unknown>,
        outputs: string[],
        options: Record<string, Record<string, string | number | boolean>>
    ) {
        const tasks = new Map<string, Promise<unknown>>();
        const resolves = new Map<string, { resolve: (value: unknown) => void, reject: (reason: unknown) => void }>();
        for (const task of this.task_names) {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            tasks.set(task, promise);
            resolves.set(task, { resolve, reject });
        }
        this.log("run() started, operators:", [...this.operators.keys()]);
        for (const op_name of this.operators.keys())
            this.runNode(op_name, tasks, resolves, context, options[op_name]);
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
        const settled_outputs = await Promise.allSettled(output_promises);
        const output_values: Record<string, unknown> = {};
        const output_errors: unknown[] = [];
        for (let i = 0; i < outputs.length; i++) {
            const result = settled_outputs[i]!;
            if (result.status === 'rejected')
                output_errors.push(result.reason);
            else
                output_values[outputs[i]!] = result.value;
        }
        if (output_errors.length > 0)
            throw new AggregateError(output_errors, `${output_errors.length} output task(s) failed`);
        this.log("run() completed, outputs:", Object.keys(output_values));
        return output_values;
    }

    private async runNode(
        name: string,
        tasks: Map<string, Promise<unknown>>,
        resolves: Map<string, { resolve: (value: unknown) => void, reject: (reason: unknown) => void }>,
        context: Record<string, unknown>,
        options: Record<string, string | number | boolean> = {}
    ): Promise<void> {
        const op = this.operators.get(name);
        if (!op) {
            throw new Error(`Node ${name} not found`);
        }
        const input_names = Object.keys(op.inputs.shape);
        const output_names = Object.keys(op.outputs.shape);
        const input_results = await Promise.allSettled(
            input_names.map(n => {
                const task = tasks.get(n);
                if (!task)
                    throw new Error(`Task "${n}" not found for node "${name}"`);
                return task;
            })
        );
        const inputs: Record<string, unknown> = {};
        const input_errors: unknown[] = [];
        for (let i = 0; i < input_names.length; i++) {
            const result = input_results[i]!;
            if (result.status === 'rejected')
                input_errors.push(result.reason);
            else
                inputs[input_names[i]!] = result.value;
        }
        if (input_errors.length > 0)
            throw new AggregateError(input_errors, `${input_errors.length} input task(s) failed for node "${name}"`);
        this.log(`operator "${name}" inputs resolved:`, input_names);
        try {
            const parsed_inputs = op.inputs.parse(inputs);
            const parsed_requires = op.requires.parse(context);
            const parsed_options = op.options.parse(options);
            let output;
            if (typeof op.exec === "string") {
                if (!this.pool)
                    throw new Error(`Worker pool not initialized for node ${name}`);
                output = await this.pool.run({ inputs: parsed_inputs, requires: parsed_requires, options: parsed_options },
                    { filename: op.exec });
            } else {
                output = await op.exec({ inputs: parsed_inputs, requires: parsed_requires, options: parsed_options });
            }
            const parsed_output = op.outputs.parse(output);
            for (const output_name of output_names) {
                const entry = resolves.get(output_name);
                if (!entry)
                    throw new Error(`Resolve not found for output "${output_name}" in node "${name}"`);
                entry.resolve(parsed_output[output_name]);
            }
            this.log(`operator "${name}" completed, outputs:`, output_names);
        } catch (err) {
            console.error(`Operator "${name}" failed:`, err);
            this.log(`operator "${name}" failed, rejecting outputs:`, output_names);
            for (const output_name of output_names) {
                resolves.get(output_name)?.reject(err);
            }
        }
    }
}