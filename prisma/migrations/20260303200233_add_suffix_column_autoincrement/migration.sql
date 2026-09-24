-- AlterTable
CREATE SEQUENCE equipment_suffix_seq;
ALTER TABLE "Equipment" ALTER COLUMN "suffix" SET DEFAULT nextval('equipment_suffix_seq');
ALTER SEQUENCE equipment_suffix_seq OWNED BY "Equipment"."suffix";
