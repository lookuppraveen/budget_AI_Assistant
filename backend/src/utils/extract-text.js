import { createRequire } from "module";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import officeParser from "officeparser";

// pdf-parse is CommonJS only — use createRequire to load it in an ESM context
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const MIME_PDF = "application/pdf";
const MIME_DOC = "application/msword";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLS = "application/vnd.ms-excel";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_PPT = "application/vnd.ms-powerpoint";
const MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MIME_CSV = "text/csv";
const MIME_TXT = "text/plain";

function sanitize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]{4,}/g, "   ") // collapse long horizontal whitespace
    .replace(/\n{4,}/g, "\n\n\n") // collapse excessive blank lines
    .trim();
}

async function extractPdf(buffer) {
  const result = await pdfParse(buffer);
  return result.text;
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractSpreadsheet(buffer, mimeType) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { strip: true });
    if (csv.trim()) {
      lines.push(`[Sheet: ${sheetName}]`);
      lines.push(csv);
    }
  }

  return lines.join("\n");
}

async function extractOffice(buffer) {
  return new Promise((resolve, reject) => {
    officeParser.parseOffice(buffer, (text, error) => {
      if (error) {
        reject(error);
      } else {
        resolve(text || "");
      }
    });
  });
}

/**
 * Extract plain text from a file buffer.
 * Returns an empty string (never throws) so uploads always succeed even if
 * the file is password-protected or uses an unsupported encoding.
 *
 * @param {Buffer} buffer   Raw file bytes
 * @param {string} mimeType MIME type of the file
 * @returns {Promise<string>} Extracted text
 */
export async function extractText(buffer, mimeType) {
  try {
    let raw = "";

    switch (mimeType) {
      case MIME_PDF:
        raw = await extractPdf(buffer);
        break;

      case MIME_DOCX:
      case MIME_DOC:
        raw = await extractDocx(buffer);
        break;

      case MIME_XLSX:
      case MIME_XLS:
      case MIME_CSV:
        raw = await extractSpreadsheet(buffer, mimeType);
        break;

      case MIME_PPTX:
      case MIME_PPT:
        raw = await extractOffice(buffer);
        break;

      case MIME_TXT:
        raw = buffer.toString("utf8");
        break;

      default:
        // Unknown type — return empty; metadata-only indexing will still work
        raw = "";
    }

    return sanitize(raw);
  } catch {
    // Extraction failure is non-fatal — return empty string
    return "";
  }
}
