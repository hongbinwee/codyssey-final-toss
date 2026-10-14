import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261014132500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "product_review" add constraint "product_review_rating_range" check ("rating" between 1 and 5);`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "product_review" drop constraint if exists "product_review_rating_range";`)
  }
}
