/**
 * Default names of the species a trade evolution can produce, as Generation V
 * games store them (mixed case, UTF-16; unlike generation IV there is no
 * uppercase, and French keeps its accents).
 *
 * Sources: PokéAPI `pokemon_species_names.csv` (master, 2026-11-24). None of
 * these 19 species was renamed after generation V. The casing was confirmed on
 * the real saves in tests/fixtures/third-party/saves/gen5/ (e.g. "Serperior").
 * Japanese and Korean are left out on purpose: a Pokémon without a nickname in
 * those games is reported as "unsupported language" instead of being renamed
 * with an unverified spelling.
 */
export type Gen5NameLang = "en" | "fr" | "de" | "it" | "es";

export const GEN5_TARGET_NAMES: Readonly<Record<number, Readonly<Record<Gen5NameLang, string>>>> = {
  65: { en: "Alakazam", fr: "Alakazam", de: "Simsala", it: "Alakazam", es: "Alakazam" },
  68: { en: "Machamp", fr: "Mackogneur", de: "Machomei", it: "Machamp", es: "Machamp" },
  76: { en: "Golem", fr: "Grolem", de: "Geowaz", it: "Golem", es: "Golem" },
  94: { en: "Gengar", fr: "Ectoplasma", de: "Gengar", it: "Gengar", es: "Gengar" },
  186: { en: "Politoed", fr: "Tarpaud", de: "Quaxo", it: "Politoed", es: "Politoed" },
  199: { en: "Slowking", fr: "Roigada", de: "Laschoking", it: "Slowking", es: "Slowking" },
  208: { en: "Steelix", fr: "Steelix", de: "Stahlos", it: "Steelix", es: "Steelix" },
  212: { en: "Scizor", fr: "Cizayox", de: "Scherox", it: "Scizor", es: "Scizor" },
  230: { en: "Kingdra", fr: "Hyporoi", de: "Seedraking", it: "Kingdra", es: "Kingdra" },
  233: { en: "Porygon2", fr: "Porygon2", de: "Porygon2", it: "Porygon2", es: "Porygon2" },
  367: { en: "Huntail", fr: "Serpang", de: "Aalabyss", it: "Huntail", es: "Huntail" },
  368: { en: "Gorebyss", fr: "Rosabyss", de: "Saganabyss", it: "Gorebyss", es: "Gorebyss" },
  464: { en: "Rhyperior", fr: "Rhinastoc", de: "Rihornior", it: "Rhyperior", es: "Rhyperior" },
  466: { en: "Electivire", fr: "Élekable", de: "Elevoltek", it: "Electivire", es: "Electivire" },
  467: { en: "Magmortar", fr: "Maganon", de: "Magbrant", it: "Magmortar", es: "Magmortar" },
  474: { en: "Porygon-Z", fr: "Porygon-Z", de: "Porygon-Z", it: "Porygon-Z", es: "Porygon-Z" },
  477: { en: "Dusknoir", fr: "Noctunoir", de: "Zwirrfinst", it: "Dusknoir", es: "Dusknoir" },
  589: { en: "Escavalier", fr: "Lançargot", de: "Cavalanzas", it: "Escavalier", es: "Escavalier" },
  617: { en: "Accelgor", fr: "Limaspeed", de: "Hydragil", it: "Accelgor", es: "Accelgor" },
};
