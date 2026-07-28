import { SalesShell } from "../_components/SalesShell";
import { NewQuoteButton } from "../_components/NewQuoteButton";

export default function NewQuotePage() {
  return (
    <SalesShell title="Create new quote">
      <div>
        <NewQuoteButton size="large" />
      </div>
    </SalesShell>
  );
}
