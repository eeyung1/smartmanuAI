import { getAuth } from "../auth";
import { getDatabase } from "../db";
import { CatalogueError } from "../catalogue/service";
import { liveEmailConfig } from "./config";
export async function liveEmailAccess(request: Request, mutation = false) {
  const config = liveEmailConfig();
  if (mutation && request.headers.get("origin") !== config.origin)
    throw new CatalogueError(403, "Invalid request origin.");
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session || !session.user.emailVerified)
    throw new CatalogueError(401, "Sign in required.");
  return {
    config,
    sql: (await getDatabase()).sql,
    userId: session.user.id,
    email: session.user.email,
  };
}
