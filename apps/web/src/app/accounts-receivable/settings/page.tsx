"use client";

import { Suspense } from "react";
import { ReminderSettingsView } from "./_components/ReminderSettingsView";

// Finance → Accounts Receivable → Reminder settings (step 7). A client page with a Suspense boundary, as the other
// Accounts Receivable pages.
export default function ReminderSettingsPage() {
  return (
    <Suspense>
      <ReminderSettingsView />
    </Suspense>
  );
}
