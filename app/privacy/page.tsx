import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import PrivacyControls from "./privacy-controls";
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return (
    <>
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Privacy controls.</h1>
      <p>
        Export your application profile and activity, or request deletion. Both
        actions require a sign-in within the last ten minutes.
      </p>
      <PrivacyControls />
    </>
  );
}
