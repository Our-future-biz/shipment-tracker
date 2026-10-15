import type { ComponentProps, ReactNode } from "react";

type ToolbarButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ToolbarButtonVariant, string> = {
  primary: "bg-indigo-600 font-semibold text-white hover:bg-indigo-700",
  secondary: "border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50",
  danger: "border border-red-200 bg-white font-medium text-red-600 hover:bg-red-50",
};

// The classes of the 32px button of the app's list toolbars (Customer Database, Shipments), for
// where the button has to be a plain element - the trigger of a dropdown or of a popover.
// "square" is the button that holds an icon and no words.
export function toolbarButtonClass(variant: ToolbarButtonVariant = "secondary", shape: "wide" | "square" = "wide"): string {
  return `flex items-center gap-1.5 shrink-0 rounded-lg ${shape === "square" ? "justify-center w-8" : "px-3"} h-8 text-[13px] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]}`;
}

// The shape is the button's own: a class from outside would replace it, so none is taken.
export type PlainButtonProps = { icon?: ReactNode } & Omit<ComponentProps<"button">, "className">;

interface ToolbarButtonProps {
  variant?: ToolbarButtonVariant;
}

// An action in that toolbar shape, wherever Sales has one: in the toolbar of a list, in the
// header of a quote, at the end of a section or of a column. One primary per row at most;
// "danger" is for Delete.
export function ToolbarButton({ variant, icon, children, ...button }: ToolbarButtonProps & PlainButtonProps) {
  return (
    <button type="button" {...button} className={toolbarButtonClass(variant)}>
      {icon}
      {children}
    </button>
  );
}
