import { redirect } from "next/navigation";
import { CrestTerminal } from "@/components/crest-terminal";
import { getAuthenticatedServerUser } from "@/lib/auth/server";

export default async function AdminAiConfigPage() {
  const session = await getAuthenticatedServerUser();

  if (!session || session.profile.role !== "admin") {
    redirect("/");
  }

  return <CrestTerminal initialView="admin" />;
}
