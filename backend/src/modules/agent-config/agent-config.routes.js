import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  agentIdParamSchema,
  createAgentConfigurationSchema,
  listAgentConfigurationsSchema,
  replaceAssignmentsSchema,
  replaceStepsSchema,
  updateAgentConfigurationSchema
} from "./agent-config.schemas.js";
import {
  createAgentConfiguration,
  deleteAgentConfiguration,
  getAgentConfiguration,
  listAgentConfigurations,
  replaceAgentAssignments,
  replaceAgentSteps,
  updateAgentConfiguration
} from "./agent-config.service.js";

const agentConfigRouter = Router();

agentConfigRouter.get(
  "/",
  authenticate,
  authorize("Admin"),
  validate(listAgentConfigurationsSchema),
  asyncHandler(async (req, res) => {
    const agentConfigs = await listAgentConfigurations(req.validated.query);
    res.status(200).json({ agentConfigs });
  })
);

agentConfigRouter.get(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(agentIdParamSchema),
  asyncHandler(async (req, res) => {
    const agentConfig = await getAgentConfiguration(req.validated.params.id);
    res.status(200).json({ agentConfig });
  })
);

agentConfigRouter.post(
  "/",
  authenticate,
  authorize("Admin"),
  validate(createAgentConfigurationSchema),
  asyncHandler(async (req, res) => {
    const agentConfig = await createAgentConfiguration(req.validated.body, req.user.id);
    res.status(201).json({ agentConfig });
  })
);

agentConfigRouter.patch(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(updateAgentConfigurationSchema),
  asyncHandler(async (req, res) => {
    const agentConfig = await updateAgentConfiguration(req.validated.params.id, req.validated.body);
    res.status(200).json({ agentConfig });
  })
);

agentConfigRouter.put(
  "/:id/assignments",
  authenticate,
  authorize("Admin"),
  validate(replaceAssignmentsSchema),
  asyncHandler(async (req, res) => {
    const agentConfig = await replaceAgentAssignments(req.validated.params.id, req.validated.body);
    res.status(200).json({ agentConfig });
  })
);

agentConfigRouter.put(
  "/:id/steps",
  authenticate,
  authorize("Admin"),
  validate(replaceStepsSchema),
  asyncHandler(async (req, res) => {
    const agentConfig = await replaceAgentSteps(req.validated.params.id, req.validated.body.steps);
    res.status(200).json({ agentConfig });
  })
);

agentConfigRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(agentIdParamSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteAgentConfiguration(req.validated.params.id);
    res.status(200).json({ result });
  })
);

export { agentConfigRouter };
