import { AppFrame } from "@/components/app-frame";
import { ReviewWorkspace } from "@/components/review-workspace";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppFrame>
      <ReviewWorkspace key={id} documentId={id} />
    </AppFrame>
  );
}
