import type { BiText } from "../_lib/publicOrder";

interface BiProps {
  text: BiText;
}

// Czech first, English after it in grey: the haulier's page (and the customer's tracking page)
// speaks both. A text with no Czech, or the same in both, is said once.
export const Bi = ({ text }: BiProps) =>
  !text.cs || text.cs === text.en ? (
    <>{text.en}</>
  ) : (
    <>
      {text.cs} <span className="font-normal text-slate-400">· {text.en}</span>
    </>
  );
