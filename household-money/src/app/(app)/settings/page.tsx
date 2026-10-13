import Link from "next/link";
import { requirePageAuth } from "@/lib/auth-guard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

const LINKS = [
  { href: "/settings/setup", title: "Setup", desc: "Step-by-step setup with connection tests" },
  { href: "/settings/security", title: "Security", desc: "2-factor, passkeys / Face ID, sign out" },
  { href: "/settings/household", title: "Household", desc: "Members, invites, joint split" },
  {
    href: "/settings/connections",
    title: "Connections",
    desc: "Plaid Items used, planned connections",
  },
  { href: "/settings/audit", title: "Audit log", desc: "Sign-ins, edits, visibility changes" },
  { href: "/settings/data", title: "Your data", desc: "Export, delete, leave household" },
];

export default async function SettingsPage() {
  const { user } = await requirePageAuth();
  return (
    <>
      <PageHeader title="Settings" subtitle={user.email} />
      <ul className="card divide-y divide-border">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-[60px] items-center justify-between px-4 py-2 hover:bg-surface-2"
            >
              <span>
                <span className="block font-medium">{l.title}</span>
                <span className="block text-xs text-text-3">{l.desc}</span>
              </span>
              <span aria-hidden="true" className="text-text-3">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
