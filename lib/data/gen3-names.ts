/**
 * Default names (uppercase, as generation III stores them) of the species involved in
 * trade evolutions that exist in generation III: the 11 that evolve and their 12 results.
 * They decide whether a Pokémon is nicknamed (generation III has no flag: the game compares the
 * nickname with the species name of its own language, pret src/evolution_scene.c
 * `EvolutionRenameMon`) and which name an evolved Pokémon gets.
 *
 * Sources: PokéAPI `pokemon_species_names.csv` (master, 2026-11-24), uppercased. All are plain
 * ASCII. Japanese is not covered: Japanese generation III saves are refused.
 */
export type Gen3NameLang = "en" | "fr" | "de" | "it" | "es";

export const GEN3_SPECIES_NAMES: Readonly<Record<number, Readonly<Record<Gen3NameLang, string>>>> = {
  61: { en: "POLIWHIRL", fr: "TÊTARTE", de: "QUAPUTZI", it: "POLIWHIRL", es: "POLIWHIRL" },
  64: { en: "KADABRA", fr: "KADABRA", de: "KADABRA", it: "KADABRA", es: "KADABRA" },
  65: { en: "ALAKAZAM", fr: "ALAKAZAM", de: "SIMSALA", it: "ALAKAZAM", es: "ALAKAZAM" },
  67: { en: "MACHOKE", fr: "MACHOPEUR", de: "MASCHOCK", it: "MACHOKE", es: "MACHOKE" },
  68: { en: "MACHAMP", fr: "MACKOGNEUR", de: "MACHOMEI", it: "MACHAMP", es: "MACHAMP" },
  75: { en: "GRAVELER", fr: "GRAVALANCH", de: "GEOROK", it: "GRAVELER", es: "GRAVELER" },
  76: { en: "GOLEM", fr: "GROLEM", de: "GEOWAZ", it: "GOLEM", es: "GOLEM" },
  79: { en: "SLOWPOKE", fr: "RAMOLOSS", de: "FLEGMON", it: "SLOWPOKE", es: "SLOWPOKE" },
  93: { en: "HAUNTER", fr: "SPECTRUM", de: "ALPOLLO", it: "HAUNTER", es: "HAUNTER" },
  94: { en: "GENGAR", fr: "ECTOPLASMA", de: "GENGAR", it: "GENGAR", es: "GENGAR" },
  95: { en: "ONIX", fr: "ONIX", de: "ONIX", it: "ONIX", es: "ONIX" },
  117: { en: "SEADRA", fr: "HYPOCÉAN", de: "SEEMON", it: "SEADRA", es: "SEADRA" },
  123: { en: "SCYTHER", fr: "INSÉCATEUR", de: "SICHLOR", it: "SCYTHER", es: "SCYTHER" },
  137: { en: "PORYGON", fr: "PORYGON", de: "PORYGON", it: "PORYGON", es: "PORYGON" },
  186: { en: "POLITOED", fr: "TARPAUD", de: "QUAXO", it: "POLITOED", es: "POLITOED" },
  199: { en: "SLOWKING", fr: "ROIGADA", de: "LASCHOKING", it: "SLOWKING", es: "SLOWKING" },
  208: { en: "STEELIX", fr: "STEELIX", de: "STAHLOS", it: "STEELIX", es: "STEELIX" },
  212: { en: "SCIZOR", fr: "CIZAYOX", de: "SCHEROX", it: "SCIZOR", es: "SCIZOR" },
  230: { en: "KINGDRA", fr: "HYPOROI", de: "SEEDRAKING", it: "KINGDRA", es: "KINGDRA" },
  233: { en: "PORYGON2", fr: "PORYGON2", de: "PORYGON2", it: "PORYGON2", es: "PORYGON2" },
  366: { en: "CLAMPERL", fr: "COQUIPERL", de: "PERLU", it: "CLAMPERL", es: "CLAMPERL" },
  367: { en: "HUNTAIL", fr: "SERPANG", de: "AALABYSS", it: "HUNTAIL", es: "HUNTAIL" },
  368: { en: "GOREBYSS", fr: "ROSABYSS", de: "SAGANABYSS", it: "GOREBYSS", es: "GOREBYSS" },
};
