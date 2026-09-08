import { AppDataSource } from "../data-source";
import { Lead } from "../entities/Lead";

export { AppDataSource } from "../data-source";

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log("Database connection established successfully");
    await backfillPhoneNormalized();
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
};

const backfillPhoneNormalized = async (): Promise<void> => {
  const { normalizePhone } = await import("../utils/phone");
  const leadRepository = AppDataSource.getRepository(Lead);

  const missing = await leadRepository
    .createQueryBuilder("lead")
    .select(["lead.id", "lead.phone", "lead.phone_normalized"])
    .where("lead.phone_normalized IS NULL OR lead.phone_normalized = ''")
    .getMany();

  if (missing.length === 0) return;

  const BATCH = 200;
  let updated = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(
      batch.map((lead) =>
        leadRepository.update({ id: lead.id }, { phone_normalized: normalizePhone(lead.phone) || null })
      )
    );
    updated += batch.length;
  }
  console.log(`Backfilled phone_normalized for ${updated} leads`);
};
