/** Texts of the editor island (English). */
export const editor = {
  upload: {
    drop: "Drop your Pokémon save here",
    choose: "Choose file",
    hint: ".sav or .dsv · never leaves your device",
    reading: "Reading save file…",
  },
  errors: {
    title: "This file can't be used",
    "unknown-format": "This doesn't look like a save file from a supported game.",
    supported: (games: string) => `Supported games: ${games}.`,
    "unsupported-version": "This game version isn't supported yet.",
    corrupt: "Part of this save is damaged (invalid checksum), so the game wouldn't load it.",
    inconsistent:
      "The internal copies of this save don't match. Load your game, save again in-game and re-export the file.",
    pokedex: "The Pokédex data isn't where the game keeps it, so this save can't be edited safely.",
    "self-check":
      "The safety check on this file didn't pass, so nothing will be changed. Your original file hasn't been touched.",
    unexpected: "Something went wrong while reading the file.",
    details: "Technical details",
  },
  save: {
    change: "Change file",
    partyCheckFailed:
      "The stored stats of a party Pokémon don't match the formula, so party evolutions are turned off to be safe. You can move that Pokémon to a PC Box and try again.",
    unreadable: (n: number) =>
      `${n} ${n === 1 ? "slot contains" : "slots contain"} unreadable data (the game would show it as a Bad Egg too): it won't be touched.`,
  },
  list: {
    party: "Party",
    box: (n: number) => `Box ${n}`,
    level: "Lv.",
    evolvableCount: (n: number) => (n === 1 ? "1 Pokémon can evolve" : `${n} Pokémon can evolve`),
    selected: (n: number) => `${n} selected`,
    selectAll: "Select all",
    selectNone: "Select none",
    noneTitle: "No Pokémon to evolve",
    noneText:
      "There's no Pokémon in this save that evolves by trade (or that's only missing the right held item).",
    consumes: (item: string) => `Uses ${item}`,
    pairedNote: "Evolves together with its partner",
  },
  reasons: {
    everstone: "Holding an Everstone",
    "missing-item": (items: string) => `Needs ${items}`,
    "unsupported-language": "Korean game: nickname it in-game first",
    "level-mismatch": "Level and Exp. don't match",
    "party-check-failed": "Party evolutions turned off",
    "national-dex": "Needs the National Pokédex first",
    "needs-partner": "Must be traded for a Karrablast or Shelmet in this save",
  },
  evolve: {
    button: (n: number) => (n === 0 ? "Evolve" : `Evolve ${n}`),
    hint: "Tap the Pokémon you want to evolve.",
    verifyFailed:
      "The new file didn't pass verification, so it won't be offered for download. Your original save hasn't been touched.",
    back: "Back",
  },
  animation: {
    what: (name: string) => `What? ${name} is evolving!`,
    congrats: (from: string, to: string) => `Congratulations! Your ${from} evolved into ${to}!`,
    skip: "Skip",
    next: "Next",
  },
  download: {
    title: (n: number) => (n === 1 ? "1 Pokémon evolved" : `${n} Pokémon evolved`),
    button: "Download save",
    hint: "Import it in Delta and start the game without loading a save state.",
    restart: "Start over",
  },
} as const;
