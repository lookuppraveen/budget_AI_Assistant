import multer from "multer";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain"
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 10 },
  fileFilter(_req, file, callback) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
    } else {
      const error = new Error(`File type not allowed: ${file.mimetype}`);
      error.statusCode = 400;
      callback(error);
    }
  }
});
