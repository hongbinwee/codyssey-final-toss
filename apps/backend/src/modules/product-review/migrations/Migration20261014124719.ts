import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014124719 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_review" ("id" text not null, "title" text not null, "body" text not null, "rating" integer not null, "written_at" timestamptz not null, "source" text check ("source" in ('native', 'amazon', 'synthetic')) not null, "source_ref" text null, "external_review_id" text null, "asin" text null, "parent_asin" text null, "is_synthetic" boolean not null default false, "verified_purchase" boolean null, "status" text check ("status" in ('pending', 'approved', 'flagged')) not null default 'pending', "displayable" boolean not null default true, "rights_ref" text null, "product_id" text not null, "variant_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_deleted_at" ON "product_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "uidx_product_review_source_external" ON "product_review" ("source", "external_review_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_product_review_public_lookup" ON "product_review" ("product_id", "status", "displayable") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_review" cascade;`);
  }

}
