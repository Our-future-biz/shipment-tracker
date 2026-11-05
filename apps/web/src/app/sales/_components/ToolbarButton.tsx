import type { ComponentProps, ReactNode } from "react";
import { BTN, BTN_DANGER, BTN_PRIMARY, ICON_BTN } from "@/styles/ui";

type ToolbarButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ToolbarButtonVariant, string> = {
  primary: BTN_PRIMARY,
  secondary: BTN,
  danger: BTN_DANGER,
};

// The classes of the app's 32px button (styles/ui.ts), for where the button has to be a plain
// element - the trigger of a dropdown or of a popover. "square" is the button that holds an icon
// and no words (ICON_BTN).
export function toolbarButtonClass(variant: ToolbarButtonVariant = "secondary", shape: "wide" | "square" = "wide"): string {
  return shape === "square" ? ICON_BTN : VARIANT_CLASS[variant];
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
