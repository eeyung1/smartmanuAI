import { createHash } from "node:crypto";
import { getDatabase } from "../src/db";
import { runDeliverySimulation } from "../src/delivery/simulation";
import { simulationAdapter, type Transport } from "../src/delivery/adapters";
// Deliberately no fetch/network implementation. Provider request bytes never leave this process.
const fixture: Transport = async (request) => {
  const id = createHash("sha256").update(request.body).digest("hex");
  return request.url.includes("resend.com")
    ? { status: 200, headers: {}, body: { id: "simulation-" + id } }
    : {
        status: 200,
        headers: {},
        body: {
          ok: true,
          result: { message_id: parseInt(id.slice(0, 10), 16) + 1 },
        },
      };
};
const db = await getDatabase();
try {
  console.log({
    mode: "simulation",
    result: await runDeliverySimulation(
      db.sql,
      {
        email: simulationAdapter("email", fixture),
        telegram: simulationAdapter("telegram", fixture),
      },
      { daily: 25, monthly: 100 },
    ),
  });
} finally {
  await db.close();
}
