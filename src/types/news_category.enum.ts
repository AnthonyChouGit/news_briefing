import * as z from "zod";

export const NewsCategorySchema = z.enum(["international", "football", "realmadrid", "f1", "ai", "mlb", "domestic", "tabletennis"]);
export type NewsCategory = z.infer<typeof NewsCategorySchema>;
