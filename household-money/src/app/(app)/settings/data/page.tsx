import { requirePageAuth } from "@/lib/auth-guard";
import { PageHeader } from "@/components/ui";
import { DataActions } from "./data-client";

export const metadata = { title: "Your data" };

export default async function DataPage() {
  const { viewer } = await requirePageAuth();
  return (
    <>
      <PageHeader title="Your data" />
      <DataActions isOwner={viewer.role === "OWNER"} />
    </>
  );
}
