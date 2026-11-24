# Generation III save format (Ruby/Sapphire, Emerald, FireRed/LeafGreen)

Sources (documentation only, no code copied): pret/pokeemerald, pret/pokefirered, pret/pokeruby
(`src/save.c`, `include/save.h`, `include/global.h`, `src/pokemon.c`, `src/evolution_scene.c`,
`src/event_data.c`, `charmap.txt`, `include/constants/{species,pokedex,items}.h`) and PKHeX
`SAV3*.cs`, `PK3.cs`, `SaveUtil.cs` (2026-11-24). Offsets confirmed on the real saves in
`tests/fixtures/third-party/saves/gen3/` (Emerald and FireRed; the Ruby file is 64 KB).

## File

- 128 KiB raw. mGBA may append 16 bytes of cartridge clock; they are kept and written back.
  A 64 KiB file (one Ruby fixture: half of the usual flash) is **refused**: slot B is missing.
- Two slots of 14 sectors of `0x1000` bytes (`0x0000` and `0xE000`); the rest holds the
  Hall of Fame and other data, never touched.
- Sector: `0xF80` data bytes, then `u16 id` at `0xFF4`, `u16 checksum` at `0xFF6`,
  `u32 signature 0x08012025` at `0xFF8`, `u32 counter` at `0xFFC`. The sectors of a slot are
  rotated in the file, so they are located by id, not position.
- Checksum: sum of the u32 words, `(sum >> 16) + sum` truncated to 16 bits (pret `CalculateChecksum`).
  The game sums only the bytes a structure uses; the real saves also validate over the whole
  `0xF80` because the unused tail is zero. For each sector the app keeps the size that
  validates the original (specific size first, `0xF80` second) and reuses it when writing.
  Declared sizes: sector 0 = SaveBlock2 (`0x890` RS, `0xF2C` E, `0xF24` FRLG), sector 4 `0xF08`,
  sector 13 `0x7D0`, others `0xF80`. **This is the part to confirm in the game.**
- Slot choice (pret `GetSaveValidStatus`): a slot is OK when all 14 ids are present and valid; the
  counter of the last valid sector is the slot's counter; the highest counter wins; the slot loaded is
  `counter % 2`. A damaged slot next to a good one is accepted only when it is the older one
  (the real FireRed fixture has a half-written older slot); a damaged newest slot is refused.

## Logical buffers

Sector 0 = SaveBlock2 (trainer, Pokédex). Sectors 1-4 concatenated = SaveBlock1 (party, flags,
vars, extra "seen" copies). Sectors 5-13 concatenated = PokemonStorage. Structures can straddle
two sectors (an 80-byte box Pokémon at index 49 does), so everything is read and written
through logical offsets.

| Data                                | RS                | Emerald           | FRLG              |
| ----------------------------------- | ----------------- | ----------------- | ----------------- |
| Party count / party (SaveBlock1)    | `0x234` / `0x238` | same              | `0x34` / `0x38`   |
| Seen copies (SaveBlock1)            | `0x938`, `0x3A8C` | `0x988`, `0x3B24` | `0x5F8`, `0x3A18` |
| National Pokédex magic (SaveBlock2) | `0x1A` = `0xDA`   | same              | `0x1B` = `0xB9`   |

SaveBlock2: name 8 bytes, trainer ID `0x0A` (TID, SID), Pokédex `0x18`: owned at `+0x10`, seen at `+0x44`,
49 bytes, bit = national number - 1. Registering a species sets owned plus the three seen arrays.
Storage: `u32` current box, 14 x 30 x 80-byte PK3, then 14 x 9-byte box names.

Game detection (PKHeX `GetVersionG3SAV`): SaveBlock2 `0xAC` = 1 FireRed/LeafGreen, 0 Ruby/Sapphire,
otherwise Emerald if bytes `0x890-0xF2B` hold data. Japanese saves (name bytes 6-7 zero) are refused.

## PK3

80 bytes in boxes, 100 in the party. Header (PID, TID/SID, nickname `0x08` x 10, language `0x12`, flags
`0x13`: bit 1 has species, bit 2 egg, OT name, checksum `0x1C`) is plain. The 48 bytes at `0x20`
are four 12-byte substructures (growth, attacks, EVs, misc) shuffled by `PID % 24` (same 24 orders
as generation IV) and XOR-ed with `PID ^ (TID | SID << 16)`. Checksum: 16-bit sum of the 24 words.
Species is the internal id (below). Level and stats are stored for the party only.
There is no nickname flag, no ability byte (IV bit 31 picks the slot) and the nature is `PID % 25`.

**Species ids.** 1-251 are national numbers, 252-276 unused, 277-411 the Hoenn species in a different
order. Derived from pret `species.h` and `pokedex.h` (`lib/data/gen3-index.ts`).

## Rules (verified on pret)

- Everstone blocks every trade evolution, Kadabra included (`GetEvolutionTargetSpecies`).
- Only rules with `since <= 3`: the four classic ones, the Gold/Silver item ones, Clamperl.
- **FireRed/LeafGreen**: without the National Pokédex an evolution into a species above Mew is cancelled
  (`evolution_scene.c`). The National Pokédex means magic byte `0xB9` plus flag `0x840`
  (`flags` at SaveBlock1 `+0xEE0`) plus variable `0x4E` = `0x6258` (`vars` at `+0x1000`).
- **Naming.** There is no nickname flag: the game renames an evolved Pokémon when its nickname equals the
  pre-evolution species name _in the cartridge's language_ (`EvolutionRenameMon`). The save does not store
  that language, so it is deduced from the Pokémon that carry the trainer's own ID (all must agree). If it is
  unknown, a Pokémon whose nickname looks like a default name is blocked ("unsupported language") and custom
  nicknames still evolve. Names are in `lib/data/gen3-names.ts` (EN, FR, DE, IT, ES; no Japanese).
- Stats, HP, the consumed item and the three-copy Pokédex are updated as in the other generations.
- Nothing is written to the other slot.
