import { z } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import {
  telegramConfig,
  telegramStatus,
  issueTelegramLink,
  changeTelegramBinding,
} from "@/src/channels/telegram";
import { apiError, readJSON } from "@/src/http/access";
import { localConfig } from "@/src/config";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    telegramConfig();
    return Response.json(
      await telegramStatus((await getDatabase()).sql, session.user.id),
    );
  } catch (e) {
    return apiError(e);
  }
}
async function mutate(request: Request, issue: boolean) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    telegramConfig();
    const { sql } = await getDatabase();
    if (issue)
      z.object({})
        .strict()
        .parse(await readJSON(request));
    return Response.json(
      issue
        ? await issueTelegramLink(sql, session.user.id)
        : await changeTelegramBinding(
            sql,
            session.user.id,
            await readJSON(request),
          ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export const POST = (request: Request) => mutate(request, true);
export const PATCH = (request: Request) => mutate(request, false);
