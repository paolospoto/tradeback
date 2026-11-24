# Generation IV save format (Diamond/Pearl, Platinum, HeartGold/SoulSilver)

These notes back every constant in `lib/save/gen4/constants.ts`. Each value was
checked against two independent references, both read as documentation only.
No code was copied from either of them.

| Reference                                                                  | Version used                 | What it is good for                                                     |
| -------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| [PKHeX](https://github.com/kwsch/PKHeX) (GPLv3)                            | commit `6c95838`, 2026-11-16 | Offsets, sizes, PK4 layout, personal data tables, real PK4 test files   |
| [pret/pokeplatinum](https://github.com/pret/pokeplatinum) decompilation    | `main`, 2026-11              | What the game itself does: save validation, evolution, Pokédex updates  |
| [PokéAPI data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) | `master`, 2026-11            | Cross-check for base stats and abilities; Italian/English display names |

All multi-byte values are little-endian.

## 1. File and partitions

- A raw DS save is 512 KiB (`0x80000`). Delta exports it as `.sav` or `.dsv`
  with no extra header. DeSmuME may append a 0x7A-byte footer ending in
  `|-DESMUME SAVE-|`. It is kept as-is and written back unchanged.
- The file holds two partitions of `0x40000` bytes. The game writes them
  alternately, so one of them is the current save and the other one is the
  previous save.
- Each partition holds a **general** block (`0xCF2C` bytes, offset 0) and a
  **storage** block with the PC boxes (`0x121E4` bytes, offset `0xCF2C`).

Sources: PKHeX `SAV4.cs`, `SAV4Pt.cs`, `SaveHandlerDeSmuME.cs`; pret
`include/constants/savedata/savedata.h`.

## 2. Block footer and checksum

The last `0x14` bytes of each block:

| Offset | Type | Field                                                                                                   |
| ------ | ---- | ------------------------------------------------------------------------------------------------------- |
| 0x00   | u32  | save counter                                                                                            |
| 0x04   | u32  | block counter                                                                                           |
| 0x08   | u32  | block size, footer included                                                                             |
| 0x0C   | u32  | signature: `0x20060623` (Japanese and international) or `0x20070903` (Korean)                           |
| 0x10   | u8   | block id: 0 general, 1 storage                                                                          |
| 0x12   | u16  | CRC16-CCITT (poly `0x1021`, init `0xFFFF`, no reflection, no final XOR) over the block minus the footer |

**Choosing the current blocks.** The app follows pret `SaveData_LoadCheck`:

1. a block is valid when its size, signature and CRC all match;
2. for each block type, the valid copy with the higher counters wins;
3. the general and storage blocks used must carry the same save counter.
   The game is slightly more lenient here. We are stricter on purpose, since a
   mismatch means the file is in a state we can't explain.

The file is rejected when no consistent pair exists. Diamond/Pearl (general block
`0xC100`) and HeartGold/SoulSilver (`0xF628`) are detected only so the app can show
a clear error message.

After an edit, only the active copy of each block is rewritten, with its CRC
recomputed. The other partition is left untouched, so it still holds the
previous save, exactly as after a normal in-game save.

## 3. General block

| Offset      | Content                                                  |
| ----------- | -------------------------------------------------------- |
| 0x68        | trainer name, 8 × u16                                    |
| 0x78 / 0x7A | trainer ID / secret ID                                   |
| 0x81        | game language (1 JA, 2 EN, 3 FR, 4 IT, 5 DE, 7 ES, 8 KO) |
| 0x9C        | party count (u8)                                         |
| 0xA0        | party: 6 × 236-byte PK4                                  |
| 0x1328      | Pokédex                                                  |

Sources: PKHeX `SAV4Pt.cs`, `SAV4.cs`.

## 4. Storage block

`u32 current box`, then 18 boxes × 30 slots × 136-byte PK4, then 18 box names
(20 × u16 each), then wallpapers. An empty slot is 136 bytes that decrypt to
zeros. Its checksum is 0, so every byte is 0. Source: PKHeX `SAV4Sinnoh.cs`.

## 5. PK4 structure

- Header: PID (u32), sanity flags (u16), checksum (u16).
- Four 32-byte blocks follow, shuffled by `((PID >> 13) & 31) % 24` (PKHeX
  `BlockPosition`) and XOR-encrypted with the Pokémon LCRNG
  (`seed = seed * 0x41C64E6D + 0x6073`, key `seed >> 16`) seeded with the checksum.
- Party-only battle data (0x88–0xEB) is encrypted with the same LCRNG seeded with the PID.
- Checksum: 16-bit sum of the u16 words in 0x08–0x87, decrypted and unshuffled.

Fields used, in the decrypted and unshuffled structure:

| Offset | Field                                                   |
| ------ | ------------------------------------------------------- |
| 0x08   | species (u16)                                           |
| 0x0A   | held item (u16)                                         |
| 0x10   | experience (u32)                                        |
| 0x15   | ability (u8)                                            |
| 0x17   | language (u8)                                           |
| 0x18   | EVs, 6 × u8                                             |
| 0x38   | IVs: 6 × 5 bits; bit 30 = egg; bit 31 = nicknamed       |
| 0x40   | bit 0 fateful encounter, bits 1–2 gender, bits 3–7 form |
| 0x48   | nickname, 11 × u16, terminated by `0xFFFF`              |
| 0x8C   | level (party only)                                      |
| 0x8E   | current HP (party only)                                 |
| 0x90   | max HP, Atk, Def, Spe, SpA, SpD (party only)            |

Sources: PKHeX `PK4.cs`, `G4PKM.cs`, `PokeCrypto.cs`; pret
`include/struct_defs/pokemon.h`, `src/pokemon.c`. The decoder was checked against
26 real PK4 files from PKHeX's test suite, covering species, nickname (including
Japanese and German), checksum, round trip, level and stats, with all of them
matching exactly.

**Text.** Generation IV text uses its own 16-bit character table. `lib/save/gen4/charset.ts`
covers codes `0x000–0x1EC`, built from the decomp charmap (`charmap.txt`) and
checked against PKHeX `StringConverter4`. When a name is written, the bytes after
the terminator are left as they are, as the game does.

## 6. What a trade evolution changes

Taken from pret `src/pokemon.c` / `src/evolution.c` (`Pokemon_SetSpecies`, `Pokemon_CalcAbility`,
`Pokemon_CalcLevelAndStats`, `Pokedex_Capture`), in the game's order:

1. **Species** set to the target.
2. **Held item** removed only for `EVO_TRADE_WITH_HELD_ITEM`. The Everstone blocks
   every trade evolution except Kadabra's: the game skips the check for it, so
   Kadabra evolves and keeps the Everstone.
3. **Ability**: second ability of the new species if it has one and the PID is odd,
   otherwise the first one.
4. **Stats** (party only): integer formula with nature ×110/100 or ×90/100.
   Current HP rises by the max-HP difference. A fainted Pokémon stays at 0 HP.
5. **Pokédex**: seen and caught bits set; gender recorded if the species was not
   seen before; language bit of the _Pokémon's_ language set (JA 0, EN 1, FR 2,
   DE 3, IT 4, ES 5; pret `pokedex_language.c`. PKHeX maps Spanish to bit 0,
   but the game uses bit 5).
6. **Name**: if the Pokémon is not nicknamed, it gets the new species name in the
   **game's** language (pret uses the save's language, not the Pokémon's).

Not changed by the app: moves learned on evolution (the move tutor in-game
covers this), game records, Pokétch history, ribbons and friendship.

**Self-check before editing.** Generation IV stores party stats only at level-up. That
means EVs gained since the last level-up are not in the stored stats yet. The
check accepts stored stats between the zero-EV result and the current-EV result,
and blocks party evolutions otherwise. A party Pokémon whose stored level
doesn't match its experience is also blocked.

**Verification after editing** (`lib/save/gen4/verify.ts`): the new image is parsed
again, both CRCs must be valid, and the bytes that changed must fall inside the
allowed ranges. Those ranges are the evolved PK4s, the Pokédex arrays and
language bytes, and the two CRCs. Anything else blocks the download.

## 7. Species data

`lib/data/gen4-species.ts` holds base stats, abilities, gender ratio and growth
rate for all 493 species. It was generated by a one-off research script from
PokéAPI's CSV files (`pokemon_stats.csv`, `pokemon_abilities.csv`,
`pokemon_species.csv`). Every row was then compared with PKHeX
`personal_pt`: 0 mismatches. The generation IV abilities differ from later
games, so PokéAPI rows were checked against the Platinum table, not the other
way round. EXP tables match pret `generated/exp_rates`.

Target-species names in the 6 game languages (`GEN4_TARGET_NAMES`) were checked
against the decomp's message banks and PKHeX's `text_species_*` files.

Display names (Italian and English) come from PokéAPI CSVs on GitHub at build
time (`scripts/fetch-species.ts`). The committed JSON is used when the build is
offline.

## 7b. Diamond/Pearl and HeartGold/SoulSilver

Same engine as Platinum, other layouts (`lib/save/gen4/layouts.ts`). The game is
recognised by the block size and signature in the footers; the general block sizes
are all different (`0xC100` D/P, `0xCF2C` Pt, `0xF628` HG/SS). Values from PKHeX
`SAV4DP.cs`, `SAV4HGSS.cs`, `SAV4Sinnoh.cs`, `Zukan4.cs` and confirmed on
`tests/fixtures/third-party/saves/gen4/{diamond,soulsilver}.sav`.

|                                       | Diamond/Pearl          | Platinum              | HeartGold/SoulSilver                                                                           |
| ------------------------------------- | ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| General block                         | `0xC100` at 0          | `0xCF2C` at 0         | `0xF628` at 0                                                                                  |
| Storage block                         | `0x121E0` at `0xC100`  | `0x121E4` at `0xCF2C` | `0x12310` at `0xF700` (gap of `0xD8`)                                                          |
| Footer                                | 0x14 bytes             | 0x14 bytes            | **0x10 bytes**: u32 counter, u32 size, u32 signature, u16 block id, u16 CRC (no block counter) |
| Trainer data                          | `0x64`                 | `0x68`                | `0x64`                                                                                         |
| Party (count at party - 4)            | `0x98`                 | `0xA0`                | `0x98`                                                                                         |
| Pokédex                               | `0x12DC`               | `0x1328`              | `0x12B8`                                                                                       |
| Species language bytes (from Pokédex) | none for our targets   | `0x128`               | `0x144`                                                                                        |
| Boxes                                 | packed, 30 x 136 bytes | packed                | each padded to `0x1000`                                                                        |
| Box names                             | after the boxes        | after the boxes       | `0x12008`                                                                                      |

Notes:

- Diamond/Pearl keep language flags for only 14 species (23, 25, 54, 77, 120, 129,
  202, 214, 215, 216, 228, 278, 287, 315). None of them is a trade-evolution target,
  so nothing is written there.
- The trade-evolution rules are the same as in Platinum. pret/pokeheartgold
  `src/pokemon.c` (`GetMonEvolution`) shows the same Kadabra exception for the Everstone.
- The party stat check skips species whose forms change the base stats (Wormadam,
  Rotom, Giratina, Shaymin): the real SoulSilver save has a Giratina in Origin Forme
  whose stored stats follow the form.
