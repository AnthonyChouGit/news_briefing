import { Entity, Column, CreateDateColumn, PrimaryColumn, Index } from "typeorm";
import { IsNotEmpty, ArrayMinSize, ArrayMaxSize, IsUrl, IsString, IsOptional, IsDate, IsArray } from "class-validator";
import * as z from "zod";
import { NewsCategorySchema, type NewsCategory } from "./news_category.enum.js";

@Entity("brief_news")
@Index("idx_brief_news_category_source_date", ["category", "source_date"])
export class BriefNews {
    @PrimaryColumn({ type: 'text' })
    @IsNotEmpty()
    @IsString()
    hash_id!: string;

    @Column({ type: 'text', unique: true, nullable: false })
    @IsUrl()
    @IsNotEmpty()
    @IsString()
    url!: string;

    @Column({ type: 'text', nullable: false })
    @IsNotEmpty()
    @IsString()
    title!: string;

    @Column({ type: 'timestamptz', nullable: false })
    @IsDate()
    source_date!: Date;

    @Column({ type: 'text', nullable: false })
    @IsNotEmpty()
    @IsString()
    source_name!: string;

    @Column({ type: 'text', nullable: false })
    @IsNotEmpty()
    @IsString()
    category!: NewsCategory;

    @Column({ type: 'text', array: true, nullable: true })
    @IsNotEmpty({ each: true })
    @ArrayMinSize(3)
    @ArrayMaxSize(5)
    @IsString({ each: true })
    @IsArray()
    @IsOptional()
    bullets?: string[] | undefined;

    @Column({ type: 'text', nullable: true, select: false })
    @IsString()
    @IsOptional()
    raw?: string | undefined;

    @CreateDateColumn({ type: 'timestamptz', nullable: false })
    @IsDate()
    created_at!: Date;
}



export const BriefNewsLikeSchema = z.object({
    hash_id: z.string().nonempty(),
    url: z.url().nonempty(),
    title: z.string().nonempty(),
    source_date: z.coerce.date(),
    source_name: z.string().nonempty(),
    category: NewsCategorySchema,
    bullets: z.array(z.string().nonempty()).min(3).max(5).optional(),
    raw: z.string().optional(),
    created_at: z.coerce.date()
}) satisfies z.ZodType<BriefNews>;

export type BriefNewsLike = z.infer<typeof BriefNewsLikeSchema>;
