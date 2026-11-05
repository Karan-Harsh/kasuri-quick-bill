// Minimal Excel (.xlsx) reading and writing — just cells of text and numbers, which is all the
// setup sheet needs. An .xlsx file is a zip of XML files; fflate does the zip part.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Column widths in characters (optional). */
  widths?: number[];
  /** Extra rows to show in bold, by index (row 0, the heading row, always is). */
  bold?: number[];
}

// ---------- writing ----------

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 can't hold at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function sheetXml(sheet: Sheet) {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const style = r === 0 || sheet.bold?.includes(r) ? ' s="1"' : ""; // bold headings
          if (value === null || value === "") return "";
          if (typeof value === "number" && Number.isFinite(value))
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  // Header row stays visible while scrolling.
  const freeze =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    // Style 0 = normal, style 1 = bold on light grey (header row).
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE7DF"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files, { level: 6 });
}

// ---------- reading ----------

const unesc = (s: string) =>
  s
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// Tags may carry a namespace prefix (<x:c>) depending on the program that saved the file.
const P = "(?:[\\w-]+:)?";
const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null;
/** Text of a string item: plain <t>, or rich text made of several <r><t> runs. Phonetic hints skipped. */
const textOf = (xml: string) =>
  [
    ...xml
      .replace(new RegExp(`<${P}rPh\\b[\\s\\S]*?</${P}rPh>`, "g"), "")
      .matchAll(new RegExp(`<${P}t\\b[^>]*>([\\s\\S]*?)</${P}t>`, "g")),
  ]
    .map((m) => unesc(m[1]!))
    .join("");

const colIndex = (ref: string) => {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export class XlsxError extends Error {}

/** Reads every sheet's cells. Throws XlsxError if this isn't an .xlsx file. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxError("This isn't an Excel (.xlsx) file.");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]!) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("This isn't an Excel (.xlsx) file.");

  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(
    new RegExp(`<${P}Relationship\\b([^>]*)/?>`, "g"),
  )) {
    const id = attr(m[1]!, "Id");
    const target = attr(m[1]!, "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const shared = [
    ...(text("xl/sharedStrings.xml") ?? "").matchAll(
      new RegExp(`<${P}si\\b[^>]*>([\\s\\S]*?)</${P}si>`, "g"),
    ),
  ].map((m) => textOf(m[1]!));

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(new RegExp(`<${P}sheet\\b([^>]*)/?>`, "g"))) {
    const name = unesc(attr(m[1]!, "name") ?? "");
    const rid = attr(m[1]!, "r:id") ?? attr(m[1]!, "[\\w-]+:id");
    const xml = rid && rels.has(rid) ? text(rels.get(rid)!) : null;
    if (!xml) continue;
    const rows: Cell[][] = [];
    let nextRow = 0;
    for (const rm of xml.matchAll(
      new RegExp(`<${P}row\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}row>)`, "g"),
    )) {
      const r = Number(attr(rm[1]!, "r")) - 1;
      const rowIndex = Number.isInteger(r) && r >= 0 ? r : nextRow;
      nextRow = rowIndex + 1;
      const row: Cell[] = [];
      let nextCol = 0;
      for (const cm of (rm[2] ?? "").matchAll(
        new RegExp(`<${P}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}c>)`, "g"),
      )) {
        const ref = attr(cm[1]!, "r");
        const col = ref ? colIndex(ref) : nextCol;
        nextCol = col + 1;
        const type = attr(cm[1]!, "t");
        const body = cm[2] ?? "";
        const v = body.match(new RegExp(`<${P}v\\b[^>]*>([\\s\\S]*?)</${P}v>`))?.[1];
        let value: Cell = null;
        if (type === "s") value = v != null ? (shared[Number(v)] ?? null) : null;
        else if (type === "inlineStr") value = textOf(body);
        else if (type === "str" || type === "e") value = v != null ? unesc(v) : null;
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v != null && v !== "") value = Number.isFinite(Number(v)) ? Number(v) : unesc(v);
        row[col] = value;
      }
      rows[rowIndex] = Array.from(row, (c) => c ?? null);
    }
    sheets.push({ name, rows: Array.from(rows, (r) => r ?? []) });
  }
  return sheets;
}
