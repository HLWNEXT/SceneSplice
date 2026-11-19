import { AppShell } from "../../components/app-shell";
import { getSession } from "../../lib/session";

export default async function Page() {
  const session = await getSession();
  return <AppShell user={session && session.email ? { name: session.name, email: session.email } : null} />;
}
