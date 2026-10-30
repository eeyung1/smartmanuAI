import { getDatabase } from "@/src/db";
import { publicOpportunity } from "@/src/catalogue/service";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await publicOpportunity((await getDatabase()).sql, id);
  return record
    ? Response.json(record)
    : Response.json({ error: "Not found." }, { status: 404 });
}
