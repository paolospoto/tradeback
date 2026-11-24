# Third-party save fixtures

Real saves from public repositories, used by the "real saves" tests in `tests/unit/`.
They are not committed: their sources have no license file. Download them with:

```bash
npm run fetch-test-saves
```

The script pins each file to a commit and checks its SHA-256. Tests that need a missing file are skipped.

| File | Size (bytes) | Source | Notes |
|---|---|---|---|
| `saves/gen1/red.sav` | 32768 | pksav-test-saves | |
| `saves/gen1/yellow.sav` | 32768 | pksav-test-saves | |
| `saves/gen2/gold.sav` | 32768 | pksav-test-saves | |
| `saves/gen2/crystal.sav` | 32812 | pksav-test-saves | 44 extra bytes at the end: emulator real-time clock data |
| `saves/gen3/ruby.sav` | 65536 | pksav-test-saves | Half the usual 128 KiB, refused as unsupported |
| `saves/gen3/emerald.sav` | 131072 | pksav-test-saves | |
| `saves/gen3/firered.sav` | 131072 | pksav-test-saves | |
| `saves/gen4/diamond.sav` | 524288 | pksav-test-saves | |
| `saves/gen4/platinum.sav` | 524288 | pksav-test-saves | |
| `saves/gen4/soulsilver.sav` | 524288 | pksav-test-saves | |
| `saves/gen5/black.sav` | 524288 | RoC's PC | Owner reports a completed Pokédex |
| `saves/gen5/white.sav` | 524288 | RoC's PC | Owner reports a completed Pokédex |
| `saves/gen5/black2.sav` | 524288 | RoC's PC | Owner reports a completed Pokédex |
| `saves/gen5/white2.sav` | 524288 | RoC's PC | Owner reports a completed Pokédex |

`saves/gen1/red-delta-export.sav` is `red.sav` imported into Delta (iOS), saved in game and
exported. It cannot be downloaded: put it there by hand to run its tests.

## Sources

| Source | Commit | Terms |
|---|---|---|
| [ncorgan/pksav-test-saves](https://github.com/ncorgan/pksav-test-saves) | `db0dd46` | README: "anyone else is welcome to them". No license file. |
| [EvenSix66/RoCs-PC](https://github.com/EvenSix66/RoCs-PC) | `1bffa8a` | No license file. The owner warns that not every file is guaranteed legitimate. |
