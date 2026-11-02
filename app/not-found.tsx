import { interfaceLocale } from "@/src/i18n/server";
import NotFoundScreen from "./components/not-found-screen";
export default async function NotFound() {
  return <NotFoundScreen locale={await interfaceLocale()} />;
}
