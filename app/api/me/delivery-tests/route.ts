import { z } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import {
  deliverySimulationConfig,
  deliveryHistory,
  prepareDeliverySimulation,
} from "@/src/delivery/simulation";
import { localConfig } from "@/src/config";
import { apiError, readJSON } from "@/src/http/access";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    deliverySimulationConfig();
    return Response.json(
      await deliveryHistory((await getDatabase()).sql, session.user.id),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    z.object({})
      .strict()
      .parse(await readJSON(request));
    return Response.json(
      await prepareDeliverySimulation(
        (await getDatabase()).sql,
        session.user.id,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
