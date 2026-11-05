import { X509Certificate } from "node:crypto";
export function localConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.SMARTMANU_MODE;
  if (mode !== "local" && mode !== "staging")
    throw new Error(
      "This spike requires SMARTMANU_MODE=local; hosted previews require explicit staging configuration.",
    );
  const baseURL = env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
    url = new URL(baseURL);
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Set a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  const databaseURL = env.DATABASE_URL;
  const databaseCA =
    mode === "staging" ? env.SMARTMANU_DATABASE_CA_CERT : undefined;
  if (databaseCA && !new X509Certificate(databaseCA).ca)
    throw new Error(
      "Database TLS certificate must be a certificate authority.",
    );
  if (mode === "staging") {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.endsWith(".vercel.app")
    )
      throw new Error(
        "Staging requires an explicit HTTPS Vercel application origin.",
      );
    const ref = env.SMARTMANU_SUPABASE_PROJECT_REF;
    if (!ref || !/^[a-z]{20}$/.test(ref) || !databaseURL)
      throw new Error(
        "Staging requires the selected Supabase project and a database connection.",
      );
    const db = new URL(databaseURL);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname.endsWith(".pooler.supabase.com") ||
      !["5432", "6543"].includes(db.port) ||
      decodeURIComponent(db.username) !== "smartmanuai_reader." + ref ||
      !db.password ||
      db.pathname !== "/postgres" ||
      db.search ||
      db.hash
    )
      throw new Error(
        "Staging requires the dedicated Supabase reader pooler connection.",
      );
    if (
      [
        env.SMARTMANU_ENABLE_COLLECTION,
        env.SMARTMANU_ENABLE_PAID_RESEARCH,
      ].includes("1") ||
      [
        env.SMARTMANU_EMAIL_MODE,
        env.SMARTMANU_TELEGRAM_MODE,
        env.SMARTMANU_DELIVERY_MODE,
      ].some(Boolean)
    )
      throw new Error(
        "Research, channel tests and paid execution must remain disabled in staging.",
      );
  } else {
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error(
        "Only a loopback HTTP origin is supported by the local spike.",
      );
    if (databaseURL) {
      const database = new URL(databaseURL);
      if (
        !["postgres:", "postgresql:"].includes(database.protocol) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
      )
        throw new Error("Only local PostgreSQL is allowed in this spike.");
    }
  }
  return {
    mode,
    baseURL: url.origin,
    secret,
    databaseURL,
    databaseCA,
    dataDir: env.SMARTMANU_DATA_DIR ?? ".local",
    databaseSchema: mode === "staging" ? "smartmanuai" : undefined,
  };
}
