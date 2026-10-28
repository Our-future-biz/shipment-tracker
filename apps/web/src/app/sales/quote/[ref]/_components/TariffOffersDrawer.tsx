import type { ReactNode } from "react";
import { Alert, Drawer, Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";

interface TariffOffersDrawerProps {
  open: boolean;
  onClose: () => void;
  width: number;
  /** The route's fields, and what they are read from */
  form: ReactNode;
  /** What keeps the route from being asked for; nothing else is shown below the form then */
  problem: string | null;
  error: Error | null;
  /** Why some tariffs have no offer, and what is missing */
  notes: readonly string[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** Whether the tariffs answered for the route */
  answered: boolean;
  /** Above the summary once answered, e.g. the terminals the offers can be narrowed to */
  filter?: ReactNode;
  /** How many offers there are and how they are ordered, or why there are none */
  summary: string;
  /** The offers' table, once answered */
  children: ReactNode;
}

// The frame of a "Tariffs available" drawer on a buying line (rail, collections, ocean): the route
// to correct, why it cannot be asked for yet or what went wrong, the tariffs' notes, and the offers.
export const TariffOffersDrawer = ({ open, onClose, width, form, problem, error, notes, isLoading, isFetching, answered, filter, summary, children }: TariffOffersDrawerProps) => (
  <Drawer open={open} onClose={onClose} width={width} destroyOnHidden title="Tariffs available">
    <div className="flex flex-col gap-4">
      {form}

      {problem && <Alert type="info" showIcon message={problem} />}
      {error && <Alert type="error" showIcon message={`Could not look up the tariffs — ${apiErrorMessage(error)}.`} />}
      {!problem && !!notes?.length && (
        <Alert
          type="warning"
          showIcon
          message={
            <ul className="m-0 pl-4">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          }
        />
      )}

      {!problem && isLoading && (
        <div className="flex justify-center p-10">
          <Spin />
        </div>
      )}
      {!problem && answered && (
        <>
          {filter}
          <div className="text-[12px] text-slate-500 flex items-center gap-2">
            {summary}
            {isFetching && <Spin size="small" />}
          </div>
          {children}
        </>
      )}
    </div>
  </Drawer>
);
