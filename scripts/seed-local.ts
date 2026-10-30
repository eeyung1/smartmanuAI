import { getDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
const db = await getDatabase();
try {
  await seedLocalCatalogue(db.sql);
  console.log("Seeded one clearly labelled synthetic opportunity.");
} finally {
  await db.close();
}
