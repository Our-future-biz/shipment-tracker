"use client";

import { useState } from "react";
import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { QuoteOrigin } from "../_lib/quoteHref";
import type { SalesQuoteData } from "../_lib/types";
import { NewQuoteDialog } from "./NewQuoteDialog";

interface NewQuoteButtonProps {
  // Passed on to the dialog: what the quote starts with, and the screen it is created on.
  start?: () => Promise<SalesQuoteData>;
  origin?: QuoteOrigin;
}

// "New Quote" with its confirmation (NewQuoteDialog), as the button of a card header.
export function NewQuoteButton({ start, origin }: NewQuoteButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
        New Quote
      </Button>
      <NewQuoteDialog open={open} onClose={() => setOpen(false)} start={start} origin={origin} />
    </>
  );
}
