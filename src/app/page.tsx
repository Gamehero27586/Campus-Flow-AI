import { redirect } from "next/navigation";
import { homeFor } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";

// The front door: sends each account to the page it belongs on.
export default async function Home() {
  redirect(homeFor(await getCurrentUser()));
}
