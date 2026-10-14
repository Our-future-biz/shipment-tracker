// Styling shared by the inline Selects of the customer cards (CRM, Company analysis).

// Inline Selects fill the value slot of a row and use its 12px text. A borderless Select keeps 8px of inner
// inset (padding + transparent border), so its wrapper pulls it back by as much: the text then lines up with the
// plain values of the other rows, and the longest account type ("TARGET CUSTOMER") fits the 300px side column.
// Borderless also means no hover or focus cue of its own, hence the background.
export const SELECT_WRAPPER_CLASS = "-ml-2";
export const SELECT_PROPS = {
  size: "small",
  variant: "borderless",
  className:
    "w-full rounded transition-colors hover:bg-slate-100 [&.ant-select-focused]:bg-slate-100 [&_.ant-select-selector]:!text-xs",
  popupMatchSelectWidth: false,
} as const;
