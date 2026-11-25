// Enter in "Link to a shipment or quote" (Council Outlay 14, P5): the field offers the jobs its text
// finds, and Enter either picks the one highlighted among them or links the plan. Pure.

/**
 * Whether the list under a field has an option highlighted, as the field tells assistive technology:
 * `aria-activedescendant` names the highlighted option, and ends in "-1" while none is (or is not
 * there while the list is closed).
 */
export const highlightsOption = (activeDescendant: string | null | undefined): boolean => !!activeDescendant && !activeDescendant.endsWith("-1");

/**
 * Whether Enter links the plan to what is typed: when no offered job is highlighted - Enter then
 * picks none, so it means "link" - or when what is typed is one of the offered jobs in full. With
 * another one highlighted, Enter only picks that one into the field.
 */
export function linksOnEnter(typed: string, offered: readonly string[], highlighted: boolean): boolean {
  const key = typed.trim().toLowerCase();
  return !highlighted || (key !== "" && offered.some((value) => value.trim().toLowerCase() === key));
}
