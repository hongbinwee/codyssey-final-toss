import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014125207 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_review" alter column "title" type text using ("title"::text);`);
    this.addSql(`alter table if exists "product_review" alter column "title" set default '';`);
    this.addSql(`alter table if exists "product_review" alter column "displayable" type boolean using ("displayable"::boolean);`);
    this.addSql(`alter table if exists "product_review" alter column "displayable" set default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_review" alter column "title" drop default;`);
    this.addSql(`alter table if exists "product_review" alter column "title" type text using ("title"::text);`);
    this.addSql(`alter table if exists "product_review" alter column "displayable" type boolean using ("displayable"::boolean);`);
    this.addSql(`alter table if exists "product_review" alter column "displayable" set default true;`);
  }

}
