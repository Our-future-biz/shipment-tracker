import { Suspense } from "react";
import { ProfileContent } from "./ProfileContent";

export default function CustomerProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  );
}
