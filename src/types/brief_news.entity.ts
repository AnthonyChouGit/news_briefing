import { Entity, Column, CreateDateColumn, PrimaryColumn } from "typeorm";
import { IsNotEmpty, ArrayMinSize, ArrayMaxSize, IsUrl, IsString, IsOptional, IsDate, IsArray } from "class-validator";
import { text } from "node:stream/consumers";

@Entity("brief_news")
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

    @Column({ type: 'text', unique: true, nullable: false })
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
    category!: string;

    @Column({ type: 'text', array: true, nullable: true })
    @IsNotEmpty({ each: true })
    @ArrayMinSize(3)
    @ArrayMaxSize(5)
    @IsString({ each: true })
    @IsArray()
    @IsOptional()
    bullets?: string[];

    @Column({ type: 'text', nullable: true })
    @IsString()
    @IsOptional()
    raw?: string;

    @CreateDateColumn({ type: 'timestamptz', nullable: false })
    @IsDate()
    created_at!: Date;
}

