import { getDatabase } from "../src/db";
const email = process.argv[2];
if (!email?.endsWith(".test"))
  throw new Error("Pass a signed-in synthetic .test account email.");
const db = await getDatabase();
try {
  const user = (
    await db.sql.query("SELECT id FROM auth_user WHERE email=$1", [email])
  ).rows[0];
  if (!user)
    throw new Error("Sign in locally before granting the administrator role.");
  await db.sql.query(
    "INSERT INTO admin_roles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user.id],
  );
  console.log("Granted local administrator access.");
} finally {
  await db.close();
}
