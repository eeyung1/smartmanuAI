export function localConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.SMARTMANU_MODE !== "local")
    throw new Error(
      "This spike requires SMARTMANU_MODE=local; public deployment is disabled.",
    );
  const baseURL = env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
  const url = new URL(baseURL);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(
      "Only a loopback HTTP origin is supported by the local spike.",
    );
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Set a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  const databaseURL = env.DATABASE_URL;
  if (databaseURL) {
    const database = new URL(databaseURL);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
    )
      throw new Error("Only local PostgreSQL is allowed in this spike.");
  }
  return {
    baseURL,
    secret,
    databaseURL,
    dataDir: env.SMARTMANU_DATA_DIR ?? ".local",
  };
}
