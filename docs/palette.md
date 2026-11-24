# Tradeback palette (dark mode)

Contrast ratios are measured against `--color-bg` / `--color-surface` / `--color-surface-raised`.

| Token                                                                | Hex                               | Use                                            | Contrast (bg / surface / raised)     |
| -------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `--color-bg`                                                         | `#120C1A`                         | Page background                                |                                      |
| `--color-surface`                                                    | `#1B1226`                         | Cards, header, panels                          |                                      |
| `--color-surface-raised`                                             | `#251A33`                         | Tiles, inputs, hover, sticky bars              |                                      |
| `--color-border`                                                     | `#3A2C4D`                         | Decorative dividers and card edges             | 1.5 / 1.4 / 1.3 (decorative only)    |
| `--color-border-strong`                                              | `#85709F`                         | Borders of inputs, buttons, empty slots        | 4.4 / 4.2 / 3.8                      |
| `--color-text`                                                       | `#F4EEFF`                         | Main text, headings                            | 16.9 / 16.0 / 14.5                   |
| `--color-text-secondary`                                             | `#C9BEDD`                         | Descriptions, labels                           | 10.9 / 10.2 / 9.3                    |
| `--color-text-muted`                                                 | `#9A8DB0`                         | Hints, metadata                                | 6.2 / 5.9 / 5.4                      |
| `--color-primary`                                                    | `#A07CD8`                         | Primary buttons, selection, links, focus       | 5.8 / 5.5 / 5.0                      |
| `--color-primary-hover`                                              | `#B494E3`                         | Hover of primary                               |                                      |
| `--color-on-primary`                                                 | `#120C1A`                         | Text on primary buttons                        | 5.8 on primary, 7.6 on hover         |
| `--color-brand-red`                                                  | `#E8384F`                         | Logo, trade badges, borders, icons, large text | 4.7 / 4.4 / 4.0 (not for small text) |
| `--color-red-text`                                                   | `#FF5A6E`                         | Red text at any size                           | 6.4 / 6.0 / 5.5                      |
| `--color-white`                                                      | `#F4EEFF`                         | Logo screen and return arrow                   |                                      |
| `--color-success`                                                    | `#4CC38A`                         | Selected / done check                          | 8.7 / 8.2 / 7.4                      |
| `--color-warning`                                                    | `#F2C14E`                         | Evolvable without a trade                      | 11.5 / 10.8 / 9.8                    |
| `--color-success-tint` / `--color-warning-tint` / `--color-red-tint` | `#16261F` / `#2A2216` / `#2E1420` | Backgrounds of tiles in those states           | text on tint ≥ 5.6                   |

Rules:

- Red text always uses `--color-red-text`, never `--color-brand-red`.
- White text never goes on `--color-brand-red` (4.1:1): use it only for badges and icons.
- Font: DM Sans (700 for headings and the wordmark).
