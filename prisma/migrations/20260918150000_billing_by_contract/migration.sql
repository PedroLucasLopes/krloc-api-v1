-- AlterTable
ALTER TABLE "LeaseItem" ADD COLUMN     "replacesItemId" TEXT;

-- CreateTable
CREATE TABLE "EquipmentPrice" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "p_diary" DOUBLE PRECISION NOT NULL,
    "p_weekly" DOUBLE PRECISION,
    "p_biweekly" DOUBLE PRECISION,
    "p_monthly" DOUBLE PRECISION,
    "p_indemnity" DOUBLE PRECISION NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentPrice_equipmentId_validFrom_idx" ON "EquipmentPrice"("equipmentId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseItem_replacesItemId_key" ON "LeaseItem"("replacesItemId");

-- AddForeignKey
ALTER TABLE "EquipmentPrice" ADD CONSTRAINT "EquipmentPrice_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_replacesItemId_fkey" FOREIGN KEY ("replacesItemId") REFERENCES "LeaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Historico de precos. A tabela atual de cada equipamento vale desde o cadastro:
-- e o que se sabe. Daqui em diante o gatilho abaixo registra cada troca, venha
-- ela do cadastro, da importacao de planilha, da edicao ou de SQL direto.
-- `now() AT TIME ZONE 'utc'`: o Postgres desta maquina esta em America/Sao_Paulo,
-- e o Prisma grava e le as datas como UTC numa coluna sem fuso.
-- ---------------------------------------------------------------------------
INSERT INTO "EquipmentPrice" ("id", "equipmentId", "p_diary", "p_weekly", "p_biweekly", "p_monthly", "p_indemnity", "validFrom")
SELECT gen_random_uuid()::text, e."id", e."p_diary", e."p_weekly", e."p_biweekly", e."p_monthly", e."p_indemnity", e."createdAt"
  FROM "Equipment" e;

CREATE FUNCTION equipment_price_history() RETURNS trigger AS $$
DECLARE
  mudou boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    mudou := true;
  ELSE
    mudou := (NEW."p_diary", NEW."p_weekly", NEW."p_biweekly", NEW."p_monthly", NEW."p_indemnity")
      IS DISTINCT FROM (OLD."p_diary", OLD."p_weekly", OLD."p_biweekly", OLD."p_monthly", OLD."p_indemnity");
  END IF;

  IF mudou THEN
    INSERT INTO "EquipmentPrice" ("id", "equipmentId", "p_diary", "p_weekly", "p_biweekly", "p_monthly", "p_indemnity", "validFrom")
    VALUES (gen_random_uuid()::text, NEW."id", NEW."p_diary", NEW."p_weekly", NEW."p_biweekly", NEW."p_monthly", NEW."p_indemnity", (now() AT TIME ZONE 'utc'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_price_history
AFTER INSERT OR UPDATE OF "p_diary", "p_weekly", "p_biweekly", "p_monthly", "p_indemnity" ON "Equipment"
FOR EACH ROW EXECUTE FUNCTION equipment_price_history();

-- ---------------------------------------------------------------------------
-- Substitutos ja registrados. O item novo herdava a data de inicio do antigo, e
-- o par so existia na auditoria da troca. Agora o substituto aponta para o item
-- que substitui e comeca na data em que chegou; a posicao continua cobrada desde
-- o inicio do original.
-- ---------------------------------------------------------------------------
WITH pares AS (
  SELECT a."contractId", a."createdAt",
         p->'old'->>'id' AS antigo_equipamento,
         p->'new'->>'id' AS novo_equipamento
    FROM "AuditLog" a, jsonb_array_elements(a."metadata"->'replacements') p
   WHERE a."action" = 'EQUIPMENT_REPLACE'
)
UPDATE "LeaseItem" novo
   SET "replacesItemId" = antigo."id",
       "startDate" = GREATEST(pares."createdAt", antigo."startDate")
  FROM pares, "LeaseItem" antigo
 WHERE novo."contractId" = pares."contractId"
   AND novo."equipmentId" = pares.novo_equipamento
   AND novo."startStatus" = 'REPLACE'
   AND novo."replacesItemId" IS NULL
   AND antigo."contractId" = pares."contractId"
   AND antigo."equipmentId" = pares.antigo_equipamento;

-- ---------------------------------------------------------------------------
-- Roubo registrado sem data de fim. O uso do roubado e cobrado ate o roubo, e a
-- data dele e a do registro na auditoria.
-- ---------------------------------------------------------------------------
UPDATE "LeaseItem" li
   SET "finishDate" = GREATEST(roubo.quando, li."startDate")
  FROM (
    SELECT a."contractId", e->>'id' AS equipamento, max(a."createdAt") AS quando
      FROM "AuditLog" a, jsonb_array_elements(a."metadata"->'equipments') e
     WHERE a."action" = 'EQUIPMENT_STATUS_CHANGED' AND e->>'status' = 'STOLEN'
     GROUP BY 1, 2
  ) roubo
 WHERE li."contractId" = roubo."contractId"
   AND li."equipmentId" = roubo.equipamento
   AND li."finalStatus" = 'STOLEN'
   AND li."finishDate" IS NULL;
