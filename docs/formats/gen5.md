# Generation V save format (Black/White, Black 2/White 2)

Sources (read as documentation only, no code copied, GPLv3): PKHeX `SAV5*.cs`,
`SaveBlockAccessor5BW/B2W2.cs`, `PK5.cs`, `PokeCrypto.cs`, `Zukan5.cs`,
`BoxLayout5.cs`, `PlayerData5.cs`, `SaveUtil.cs` (master, 2026-11-24). pret has no
generation V decompilation, so game behaviour comes from PKHeX and the real saves in
`tests/fixtures/third-party/saves/gen5/` (4 files, 2 copies each).

## File

- Raw 512 KiB, same wrapper as the other DS games (optional DeSmuME footer).
- Two copies: the main one at offset 0 and the backup right after it. Copy size
  `0x24000` (B/W) or `0x26000` (B2/W2). In the real saves both copies are valid and differ.
- **The main copy is edited, the backup is left untouched**, as PKHeX does. The game has
  no save counters to compare, so this is the one point not provable without the
  game. Test it in Delta before trusting it.

## Blocks and checksums

- The copy is a list of blocks (70 in B/W, 74 in B2/W2; `lib/save/gen5/blocks.ts`,
  extracted from PKHeX's tables). Every block is followed by 2 padding bytes and its
  CRC16-CCITT (`offset + length + 2`), computed over the block data.
- The last block is the **checksum block** (B/W `0x23F00`, length `0x8C`; B2/W2
  `0x25F00`, length `0x94`). It holds a copy of every block CRC at
  `checksumBlock + 2 * index`, and its own CRC at `checksumBlock + length + 0xE`.
- The game is recognised by the checksum block CRC (PKHeX `IsValidFooter5`), then the
  trainer data tells Black/White (21/20) from Black 2/White 2 (23/22).
- Checked on the real saves: 0 bad blocks out of 70/74, in both copies.

## Where things are

| Data       | Block                | Detail                                                           |
| ---------- | -------------------- | ---------------------------------------------------------------- |
| Box names  | 0                    | from +4, `0x28` apart, 10 characters used                        |
| Boxes 1-24 | 1-24                 | 30 x 136-byte PK5 each, block starts `0x1000` apart from `0x400` |
| Party      | 26 (`0x18E00`)       | count (u8) at +4, 6 x 220-byte PK5 from +8                       |
| Trainer    | 27 (`0x19400`)       | name 8 x u16 at +4, TID/SID at +0x14, language +0x1E, game +0x1F |
| Pokédex    | 55 (B/W), 54 (B2/W2) | see below                                                        |

## PK5

Same layout, shuffle and encryption as PK4 for everything the app reads (the PK4 crypto
is reused). Differences: the **nature is stored** at `0x41` (it is not `PID % 25`; the
real saves confirm it), a hidden-ability flag at `0x42` bit 0, text is UTF-16 with a
`0xFFFF` terminator (default names are mixed case, e.g. "Serperior"), and a party Pokémon
is 220 bytes. Ability slot comes from PID bit 16.

## Pokédex

`u32 magic 0xBEEFCAFE`, `u32 packed` (bit 0 = National Pokédex), caught (`0x08`), 4 seen
regions (male, female, shiny male, shiny female, `0x54` bytes each), 4 displayed regions,
form flags (9 or 11 bytes x 4), then 7 language bits per species (1-493 only).
Registering an evolved Pokémon sets its seen region, caught, displayed (if none yet) and
the language bit (JA, EN, FR, IT, DE, ES; not Korean).

## Rules

- Evolution changes: species, ability (hidden flag kept when the new species has one),
  party stats and HP, consumed item, default name, Pokédex.
- **Everstone blocks every trade evolution, Kadabra included.** The Kadabra exception is
  only confirmed for generation IV; refusing is the safe side.
- **Karrablast and Shelmet** evolve only when traded for each other. They are paired in
  save order (party, then boxes); neither evolves if one holds an Everstone, and a lone
  one stays blocked. Selecting one in the UI selects its partner.
- Names are written in mixed case in the game's language (English, French, German,
  Italian, Spanish; `lib/data/gen5-names.ts`). Japanese and Korean saves keep nicknames
  but block evolutions of un-nicknamed Pokémon ("unsupported language").
- The party stat check skips species whose forms change the base stats.
