# Generations I and II (Red/Blue/Yellow, Gold/Silver/Crystal)

Western versions only. Sources (documentation only, no code copied): pret/pokered, pret/pokeyellow,
pret/pokegold, pret/pokecrystal (`ram/sram.asm`, `ram/wram.asm`, `macros/ram.asm`, `engine/menus/save.asm`,
`engine/pokemon/evos_moves.asm` and `evolve.asm`, `constants/*`, `data/pokemon/*`) and PKHeX `SaveUtil.cs`,
`SAV1.cs` (game detection, Yellow signature). Every offset was confirmed on the real saves in
`tests/fixtures/third-party/saves/gen1|gen2/`. Japanese and Korean versions use other offsets and are not
recognised (reported as an unknown format).

## Common

- 32 KiB SRAM image. Generation II saves may carry the real-time clock after it (44 bytes in the Crystal
  fixture, possibly 48): kept untouched and written back. The Delta export of Red is a raw 32 KiB file.
- Text: Game Boy charset, terminator `0x50`, names are 11 bytes padded with `0x50`
  (`lib/save/gen1/charset.ts`, generated from the pret charmaps).
- Stats are not computed from IVs: DVs (4 bits, byte 0 = Atk/Def, byte 1 = Spd/Spc, HP DV = low bits of the other
  four) and Stat Exp (5 x u16). `stat = ((base + DV) * 2 + ceil(sqrt(statExp)) / 4) * level / 100 + 5`, HP
  `+ level + 10`. Verified exactly on Yellow, Crystal and Gold parties. The Red fixture's party was edited
  without recomputing the stats, so the self-check reports it and blocks party evolutions in that file.
- Trade evolution in both games: species, nickname when it is the old species name, stats, HP (old HP plus the
  max HP gain, even for a fainted Pokémon), Pokédex seen and caught. Moves learned on evolution are not changed.
- **Language is not stored.** Names are compared in every Western language; the language is deduced from the
  player's own Pokémon (same trainer ID) that still have a default name (`lib/save/gen1/names.ts`,
  `lib/data/gb-names.ts`). If the languages left disagree on the new name (e.g. a lone "KADABRA" is
  ALAKAZAM in English, SIMSALA in German), the evolution is blocked as "unsupported language".
- Box Pokémon evolve too (the game only evolves the party in a link trade): species, name, Pokédex, item.
  Box structures hold no stats.

## Generation I

| Data                    | Offset                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Player name             | `0x2598` (11 bytes)                                                                                           |
| Pokédex owned / seen    | `0x25A3` / `0x25B6` (19 bytes each, bit = number - 1)                                                         |
| Trainer ID (big-endian) | `0x2605`                                                                                                      |
| `wCurrentBoxNum`        | `0x284C` (bit 7 = boxes changed once)                                                                         |
| Party list              | `0x2F2C`: count, 6 species + `0xFF`, 6 x 44-byte structs, OT names, nicknames                                 |
| Current box             | `0x30C0`: count, 20 species + `0xFF`, 20 x 33-byte structs, OT names, nicknames (`0x462` bytes)               |
| Stored boxes            | bank 2 (`0x4000`) boxes 1-6, bank 3 (`0x6000`) boxes 7-12, then an all-boxes checksum and 6 per-box checksums |
| Main checksum           | 8-bit sum of `0x2598-0x3522`, complemented, at `0x3523`                                                       |

Species are internal indexes: `lib/data/gen1-species.ts` joins pret's `PokedexOrder` with the national numbers.
The stored boxes are only valid once bit 7 of `wCurrentBoxNum` is set, and the current box lives in the
Current box area (its bank slot is not used). Types are stored in the struct but all four evolutions keep the
same types, so nothing is rewritten. Yellow is told by the starter / Pikachu friendship bytes (`0x29C3`, `0x271C`).
Rules: Kadabra, Machoke, Graveler, Haunter; no items, so no Everstone.

## Generation II

|                             | Crystal                               | Gold/Silver                           |
| --------------------------- | ------------------------------------- | ------------------------------------- |
| Check values                | `99` at `0x2008`, `127` at `0x2D0F`   | `99` at `0x2008`, `127` at `0x2D6B`   |
| Game data (16-bit byte sum) | `0x2009-0x2B82`, checksum at `0x2D0D` | `0x2009-0x2D68`, checksum at `0x2D69` |
| Party (`wPartyCount`)       | `0x2865`                              | `0x288A`                              |
| Active box                  | `0x2D10`                              | `0x2D6C`                              |
| `wCurBox`                   | `0x2702`                              | `0x2726`                              |

Common: trainer ID (big-endian) `0x2009`, name `0x200B`; party count, 6 species + `0xFF`, 6 x 48-byte structs,
OT names, nicknames, 22 bytes, then the Pokédex (caught 32 bytes, seen 32 bytes) at party + 450. Boxes: 14 x `0x450`
bytes (count, 20 species + `0xFF`, 20 x 32-byte structs, OT names, nicknames, 2 padding), boxes 1-7 in bank 2, 8-14
in bank 3, the current box in the active box area. Boxes have no checksum. Species are national numbers; `0xFD` is an egg
(ignored). Silver is built from the same source as Gold and uses the same offsets.
The game keeps a backup copy of the save data; it only reads it when the main copy fails its checks, so the backup
is left untouched like the other generations' older copies.
Rules: the Everstone blocks every trade evolution; King's Rock (Poliwhirl, Slowpoke), Metal Coat (Onix, Scyther),
Dragon Scale (Seadra) and Up-Grade (Porygon) are required and spent. Item ids are the same in both repositories.
