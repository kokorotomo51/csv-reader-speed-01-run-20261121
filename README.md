# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kokorotomo51/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kokorotomo51/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Entered in [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121): a fast, dependency-free CSV reader that returns exactly the same answers as the reference reader for every input, while running several times faster on large files.

## What it does

`run({ text, header })` returns `{ columns, rows, errors }`:

- A leading BOM is dropped; records end at LF or CRLF; lines left with no characters are no record.
- Lone CRs outside quoted fields are dropped and reported as `stray_cr`.
- Fields that open with a quote run to the next undoubled quote (`""` becomes one quote); embedded CRLF and lone CRs become LF. Characters after the closing quote are appended as they stand and reported as `quote_junk`; a quote that never closes is read literally and reported as `unterminated_quote`.
- Rows are padded with `""` to the first record's width (`short_row`) or cut to it (`long_row`), with the cut fields reported.

## How it is fast

Two paths, no per-character concatenation, no whole-text regexes, stdlib only:

- **Quote-free lines** are sliced once, split on commas, and stripped of lone CRs — the path that dominates plain tabular data.
- **Everything else** goes through a single-pass index-based scanner: `indexOf` jumps between delimiters, `slice` extracts fields, doubled quotes collapse segment-wise, and the next-quote / next-CR positions are cached monotonically so delimiter searches cost O(n) over the whole input instead of O(n) per record.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` is the harness driver: it reads `cases.json`, calls `run()` from `solve.js` per case, and writes `answers.json`. It sets V8 `--no-incremental-marking` before importing `solve.js`, matching the house baseline.

## Files

- `main.ts` — harness driver (unchanged contract).
- `solve.js` — the reader, written from the competition spec.
- `package.json` — `{"type":"module"}`.
- `LICENSE` — MIT.
