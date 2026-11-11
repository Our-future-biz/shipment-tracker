"use client";

import { useCallback, type Ref } from "react";
import { InputNumber, type GetRef, type InputNumberProps } from "antd";
import { decimalInputText } from "@/lib/money";

export type DecimalInputProps = Omit<InputNumberProps<number>, "parser" | "decimalSeparator" | "stringMode"> & {
  ref?: Ref<GetRef<typeof InputNumber>>;
};

/**
 * The number field for a number that may have decimals - an amount, a rate, a percentage, a
 * weight, a coordinate: antd's InputNumber reading what is typed the Czech way ("2 592,45", "12,5",
 * "-3,25") as well as the English one ("2,592.45"). antd's own reading drops the comma, so "12,5"
 * became 125 and then the field's maximum. What is typed stays as it is while the field is being
 * typed in; once left, the field shows the number with a decimal point, as the app writes figures.
 */
export function DecimalInput({ min, max, ...rest }: DecimalInputProps) {
  const parser = useCallback((text: string | undefined) => decimalInputText(text, min, max) as unknown as number, [min, max]);
  return <InputNumber<number> {...rest} min={min} max={max} parser={parser} />;
}
