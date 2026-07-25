import { Suspense } from "react";
import { CustomersView } from "./_components/CustomersView";

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersView />
    </Suspense>
  );
}
