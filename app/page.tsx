import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/constants/enums";

export default async function RootPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }
  if (session.mustChangePassword) {
    redirect("/force-change-password");
  }
  redirect(ROLE_HOME[session.role]);
}
