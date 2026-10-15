import type { BiText } from "../_lib/publicOrder";

interface BiProps {
  text: BiText;
}

// Czech first, English after it in grey: the haulier's page speaks both.
export const Bi = ({ text }: BiProps) => (
  <>
    {text.cs} <span className="font-normal text-slate-400">· {text.en}</span>
  </>
);
