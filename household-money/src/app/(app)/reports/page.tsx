import { PageHeader, StageNote } from "@/components/ui";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Monthly report for Household, Kanchit and Wife" />
      <StageNote stage={3}>
        The monthly report (summary, category vs budget, spend by person/card, subscriptions, net
        worth trend, flags, data-quality score) and PDF export are built in Stage 3 and expanded in
        Stage 12.
      </StageNote>
    </>
  );
}
