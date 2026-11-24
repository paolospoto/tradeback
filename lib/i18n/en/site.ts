/** Shared site texts (English). */
export const site = {
  site: {
    name: "Tradeback",
    tagline: "Trade evolutions for your Pokémon save, no second player needed.",
  },
  footer: {
    privacy: "Your save never leaves your device. Everything runs in your browser.",
    source: "Source on GitHub",
    artwork: "Artwork from PokéAPI",
    legal:
      "Pokémon is a trademark of Nintendo, Creatures and GAME FREAK / The Pokémon Company. Tradeback is not affiliated with or endorsed by them. Artwork is loaded at runtime and © its respective owners.",
  },
  help: {
    open: "How it works",
    counter: (n: number, total: number) => `Step ${n} of ${total}`,
    skip: "Skip",
    back: "Back",
    next: "Next",
    done: "Got it",
    steps: [
      {
        title: "Bring your save",
        text: "Haunter only turns into Gengar when it's traded, and you need a second player for that. Not here! In Delta, long-press your Pokémon game (any from Red and Blue to Black 2 and White 2), choose “Export Save File”, then drop that file on this page.",
      },
      {
        title: "Pick who evolves",
        text: "You'll see every Pokémon that evolves by trade, like your Haunter. Tap it so it gets a red check, then press “Evolve”. Tap “Select all” to evolve them all at once.",
      },
      {
        title: "Download and play",
        text: "Enjoy the evolution, then tap “Download save”. In Delta, long-press the game, choose “Import Save File” and start the game normally (not from a save state). Say hi to Gengar!",
      },
    ],
  },
} as const;
