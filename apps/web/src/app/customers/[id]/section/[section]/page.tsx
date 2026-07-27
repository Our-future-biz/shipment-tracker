import { Suspense } from "react";
import { SectionContent } from "./SectionContent";

export default function CustomerSectionPage() {
  return (
    <Suspense fallback={null}>
      <SectionContent />
    </Suspense>
  );
}
