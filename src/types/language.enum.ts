import * as z from "zod";

export const LanguageSchema = z.enum(['English', 'Chinese', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Japanese', 'Korean']);

export type Language = z.infer<typeof LanguageSchema>;
