import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { documentUpload } from "../../middleware/upload.js";
import { z } from "zod";
import { createDocumentSchema, ingestUrlSchema, listDocumentsQuerySchema, updateDocumentStatusSchema, uploadDocumentSchema } from "./documents.schemas.js";

const documentIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.string().uuid("Invalid document id") }),
  query: z.object({})
});
import { createDocument, deleteDocument, getDocumentDownloadUrl, ingestUrl, listDocuments, reuploadDocument, updateDocumentStatus, uploadDocuments } from "./documents.service.js";
import { logAudit } from "../../utils/audit.js";

const documentsRouter = Router();

/**
 * @swagger
 * /documents:
 *   get:
 *     tags: [Documents]
 *     summary: List knowledge documents
 *     parameters:
 *       - in: query
 *         name: departmentCode
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Pending, Approved, Rejected, Hold] }
 *     responses:
 *       200:
 *         description: Array of documents
 */
documentsRouter.get(
  "/",
  authenticate,
  validate(listDocumentsQuerySchema),
  asyncHandler(async (req, res) => {
    const SCOPED_ROLES = ["Department Editor", "Read Only"];
    const query = { ...req.validated.query };
    if (SCOPED_ROLES.includes(req.user.role) && req.user.departmentId) {
      query.departmentId = req.user.departmentId;
    }
    const documents = await listDocuments(query);
    res.status(200).json({ documents });
  })
);

documentsRouter.post(
  "/",
  authenticate,
  authorize("Admin", "Budget Analyst", "Department Editor"),
  validate(createDocumentSchema),
  asyncHandler(async (req, res) => {
    const document = await createDocument(req.validated.body, req.user.id);
    res.status(201).json({ document });
  })
);

documentsRouter.patch(
  "/:id/status",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(updateDocumentStatusSchema),
  asyncHandler(async (req, res) => {
    const document = await updateDocumentStatus(req.validated.params.id, req.validated.body, req.user.id);
    logAudit(req, `document.${req.validated.body.status.toLowerCase()}`, "document", req.validated.params.id, {
      status: req.validated.body.status,
      reviewNote: req.validated.body.reviewNote
    });
    res.status(200).json({ document });
  })
);

documentsRouter.post(
  "/upload",
  authenticate,
  authorize("Admin", "Budget Analyst", "Department Editor"),
  documentUpload.array("files", 10),
  validate(uploadDocumentSchema),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      const error = new Error("No files provided");
      error.statusCode = 400;
      throw error;
    }

    const documents = await uploadDocuments(
      { files: req.files, domain: req.validated.body.domain, departmentCode: req.validated.body.departmentCode },
      req.user.id
    );

    res.status(201).json({ documents });
  })
);

documentsRouter.get(
  "/:id/download",
  authenticate,
  validate(documentIdParamSchema),
  asyncHandler(async (req, res) => {
    const result = await getDocumentDownloadUrl(req.validated.params.id);
    res.status(200).json(result);
  })
);

documentsRouter.put(
  "/:id/reupload",
  authenticate,
  authorize("Admin", "Budget Analyst", "Department Editor"),
  documentUpload.single("file"),
  validate(documentIdParamSchema),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      const error = new Error("No file provided");
      error.statusCode = 400;
      throw error;
    }

    const result = await reuploadDocument(req.validated.params.id, req.file);
    logAudit(req, "document.reuploaded", "document", req.validated.params.id, {
      title: result.title,
      extractedChars: result.extractedChars
    });
    res.status(200).json({ document: result });
  })
);

documentsRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(documentIdParamSchema),
  asyncHandler(async (req, res) => {
    const deleted = await deleteDocument(req.validated.params.id);
    logAudit(req, "document.deleted", "document", req.validated.params.id, { title: deleted.title });
    res.status(200).json({ message: "Document deleted.", id: deleted.id });
  })
);

documentsRouter.post(
  "/ingest-url",
  authenticate,
  authorize("Admin", "Budget Analyst", "Department Editor"),
  validate(ingestUrlSchema),
  asyncHandler(async (req, res) => {
    const document = await ingestUrl(req.validated.body, req.user.id);
    res.status(201).json({ document });
  })
);

export { documentsRouter };