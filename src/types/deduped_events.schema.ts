import * as z from "zod";

export const createDedupedEventsSchema = (hash_ids: string[]) => {
    if (!hash_ids || hash_ids.length === 0) {
        throw new TypeError("createDedupedEventsSchema: hash_ids array must not be empty");
    }
    return z.array(
        z.enum(hash_ids)
    );
}

