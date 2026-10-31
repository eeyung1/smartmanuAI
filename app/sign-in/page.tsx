import { interfaceLocale } from "@/src/i18n/server";
import SignIn from "./form";
export default async function SignInPage() {
  const locale = await interfaceLocale();
  return <SignIn key={locale} locale={locale} />;
}
