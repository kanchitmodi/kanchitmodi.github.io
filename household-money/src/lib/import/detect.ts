import Papa from "papaparse";
import { ImportParseError, type ParseResult } from "./types";
import type { CsvFormat, Grid } from "./formats/shared";
import { cibc, generic, pcFinancial, rogers, scotiabank, td, wealthsimple } from "./formats/banks";
import { ibkr, questrade } from "./formats/brokers";
import { extractPdfText, parseStatementText } from "./pdf";

export const FORMATS: CsvFormat[] = [
  wealthsimple,
  rogers,
  pcFinancial,
  scotiabank,
  questrade,
  ibkr,
  td,
  cibc,
  generic,
];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20_000;

export function parseCsvText(text: string): Grid {
  const r = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  return r.data.map((row) => row.map((c) => (c ?? "").toString()));
}

/** Pick the best-matching institution format. Ties go to the earlier (more specific) format. */
export function detectFormat(grid: Grid): CsvFormat | null {
  let best: CsvFormat | null = null;
  let score = 0;
  for (const f of FORMATS) {
    const s = f.detect(grid);
    if (s > score) {
      best = f;
      score = s;
    }
  }
  return best;
}

export function parseCsv(text: string): ParseResult {
  const grid = parseCsvText(text);
  if (grid.length > MAX_ROWS) throw new ImportParseError(`File has more than ${MAX_ROWS} rows`);
  const fmt = detectFormat(grid);
  if (!fmt)
    throw new ImportParseError(
      "Couldn't recognize this CSV. Supported: Wealthsimple, TD, CIBC, Scotiabank, PC Financial, Rogers, Questrade, IBKR, or any CSV with Date/Description/Amount columns.",
    );
  const r = fmt.parse(grid);
  return { format: fmt.key, institution: fmt.institution || null, ...r };
}

export async function parseImportFile(name: string, bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportParseError("File is larger than 5 MB");
  const isPdf =
    /\.pdf$/i.test(name) ||
    (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (isPdf) return parseStatementText(await extractPdfText(bytes));
  return parseCsv(new TextDecoder("utf-8").decode(bytes));
}
