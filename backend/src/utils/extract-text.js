import { createRequire } from "module";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import officeparser from "officeparser";
import { createCanvas, DOMMatrix, DOMPoint, Path2D } from "@napi-rs/canvas";
import Tesseract from "tesseract.js";

// Polyfill DOMMatrix / Path2D globally so pdfjs-dist can render in Node.js
if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.DOMPoint === "undefined") globalThis.DOMPoint = DOMPoint;
if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = Path2D;

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

// Minimum chars per page to consider text-based extraction successful
const MIN_CHARS_PER_PAGE = 80;
// Minimum ratio of "real words" (3+ alpha chars) to total whitespace-tokens
// to consider extracted text high-quality rather than garbled scan artifacts
const MIN_WORD_QUALITY_RATIO = 0.5;
// Max pages to OCR (to keep processing time reasonable)
const MAX_OCR_PAGES = 30;
// Scale factor for rendering — higher = better OCR accuracy but slower
const RENDER_SCALE = 2.0;

function sanitize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]{4,}/g, "   ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// ── Canvas factory required by pdfjs to render pages in Node.js ──────────────
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

// ── OCR a single PNG buffer using Tesseract ──────────────────────────────────
async function ocrImage(worker, imageBuffer) {
  const result = await worker.recognize(imageBuffer);
  return result.data.text || "";
}

// ── Render PDF pages to images and OCR each one ──────────────────────────────
async function extractPdfWithOcr(buffer) {
  // Lazy-import pdfjs legacy build (v3 CommonJS — solid Node.js support)
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js").catch(() => null);
  if (!pdfjsLib) return "";

  const canvasFactory = new NodeCanvasFactory();

  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    canvasFactory
  }).promise;

  const pageCount = Math.min(pdfDoc.numPages, MAX_OCR_PAGES);
  const texts = [];

  // Single reusable Tesseract worker for all pages
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => {}   // silence progress logs
  });

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory
      }).promise;

      const imageBuffer = canvasAndContext.canvas.toBuffer("image/png");
      console.log(`[extract-text] OCR page ${pageNum}/${pageCount} — rendered ${imageBuffer.length} bytes`);

      const pageText = await ocrImage(worker, imageBuffer);
      const trimmed = pageText.trim();
      console.log(`[extract-text] OCR page ${pageNum} — extracted ${trimmed.length} chars`);
      if (trimmed) {
        texts.push(trimmed);
      }

      canvasFactory.destroy(canvasAndContext);
      page.cleanup();
    }
  } finally {
    await worker.terminate();
  }

  return texts.join("\n\n");
}

// ── Check whether extracted text looks like real words or garbled artifacts ──
function isTextQualityGood(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  // A "real word" has at least 3 alphabetic characters in a row
  const realWords = tokens.filter((t) => /[a-zA-Z]{3,}/.test(t));
  const ratio = realWords.length / tokens.length;

  console.log(
    `[extract-text] Text quality: ${realWords.length}/${tokens.length} real-word tokens (${(ratio * 100).toFixed(1)}%), threshold ${(MIN_WORD_QUALITY_RATIO * 100).toFixed(0)}%`
  );

  return ratio >= MIN_WORD_QUALITY_RATIO;
}

// ── PDF extraction: try text layer first, fall back to OCR ───────────────────
async function extractPdf(buffer) {
  let textResult = "";
  let pageCount = 1;

  try {
    const parsed = await pdfParse(buffer);
    textResult = parsed.text || "";
    pageCount = parsed.numpages || 1;
  } catch {
    // pdf-parse failed — will try OCR below
  }

  const charsPerPage = textResult.trim().length / pageCount;
  const qualityOk = isTextQualityGood(textResult);

  // If text layer has sufficient content AND quality, it's a real text-based PDF
  if (charsPerPage >= MIN_CHARS_PER_PAGE && qualityOk) {
    console.log(`[extract-text] PDF text layer OK — ${Math.round(charsPerPage)} chars/page, quality passed`);
    return textResult;
  }

  // Scanned PDF, sparse text, or garbled artifacts — run OCR
  const reason = !qualityOk ? "low text quality (garbled)" : "sparse text";
  console.log(`[extract-text] PDF has ${Math.round(charsPerPage)} chars/page, ${reason} — running OCR`);
  try {
    const ocrText = await extractPdfWithOcr(buffer);
    // Use whichever result has more content
    if (ocrText.trim().length > textResult.trim().length) {
      console.log(`[extract-text] OCR produced more text (${ocrText.trim().length} vs ${textResult.trim().length} chars) — using OCR result`);
      return ocrText;
    }
    console.log(`[extract-text] Text layer had more content — using text layer result`);
    return textResult;
  } catch (err) {
    console.warn("[extract-text] OCR failed, using text-layer result:", err.message);
    return textResult;
  }
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
    officeparser.parseOffice(buffer, (text, error) => {
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
 * For PDFs: tries text-layer extraction first, falls back to OCR for scanned PDFs.
 * Returns an empty string (never throws) so uploads always succeed.
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
        raw = "";
    }

    return sanitize(raw);
  } catch {
    return "";
  }
}
