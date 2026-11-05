import { Pill } from "@/components/Pill";

// "also supplier" / "also customer" beside the name of a company that is both.
export function AlsoChip({ children }: { children: string }) {
  return <Pill tone="slate">{children}</Pill>;
}
