// The colour and the hover of a text link, as the app draws its links: indigo, underlined on
// hover. Both need "!": antd styles every <a> on the page in unlayered CSS - its own blue, no
// underline in any state - and that wins over a plain utility. Size, weight and font are added
// by the place the link stands in.
export const LINK_CLASS = "!text-indigo-600 hover:!underline";
