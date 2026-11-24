import { editor } from "./en/editor";
import { site } from "./en/site";

/** All interface texts (English). Add a folder with the same shape to translate. */
export const t = { ...site, editor } as const;
export type Texts = typeof t;
