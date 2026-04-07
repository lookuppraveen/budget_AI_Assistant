import { useEffect, useMemo, useState } from "react";
import {
  createAgentConfiguration,
  createRole,
  createMasterType,
  createMasterValue,
  createRunFilterPreset,
  createDepartment,
  deleteAgentConfiguration,
  deleteRole,
  deleteDepartment,
  deleteMasterType,
  deleteMasterValue,
  deleteRunFilterPreset,
  getAdminUsers,
  getDepartments,
  getMasterData,
  getRolePermissions,
  getRunFilterPresets,
  getRetrievalQuality,
  getRetrievalRuns,
  getRetrievalScheduler,
  getDocuments,
  getAgentConfigurations,
  getRetrievalHealth,
  listDocumentChunks,
  reindexDocumentChunks,
  replaceAgentAssignments,
  replaceAgentSteps,
  runRetrievalReindex,
  updateAgentConfiguration,
  updateDepartment,
  updateRole,
  updateMasterType,
  updateMasterValue,
  updateRetrievalScheduler,
  updateAdminUser,
  updateRolePermissions,
  updateDocumentStatus
} from "../../services/adminApi.js";
import { downloadDocument } from "../../services/documentsApi.js";

const masterSeed = {
  "Fund Type": ["General Fund", "Restricted Fund", "Capital Fund"],
  "Fiscal Year": ["FY25", "FY26", "FY27"],
  "Request Status": ["Draft", "Submitted", "Reviewed", "Approved"],
  "Expense Category": ["Personnel", "Operations", "Technology", "Facilities"]
};

const wizardStepTemplates = [
  {
    key: "purpose_scope",
    title: "Define the agent purpose and scope",
    meaning: "Describe exactly what this department agent should help users accomplish.",
    placeholder: "This agent supports..."
  },
  {
    key: "hard_boundaries",
    title: "Define hard boundaries (what the agent will not do)",
    meaning: "Set explicit non-negotiable limits to avoid unsafe or unauthorized behavior.",
    placeholder: "The agent must never..."
  },
  {
    key: "primary_user_needs",
    title: "Identify primary user and core needs",
    meaning: "Capture who the main users are and what outcomes they need from this agent.",
    placeholder: "Primary users are... Their top needs are..."
  },
  {
    key: "top_questions",
    title: "Identify top questions and tasks",
    meaning: "List the most common questions and tasks the agent must answer reliably.",
    placeholder: "Top questions include..."
  },
  {
    key: "approved_sources",
    title: "Select and approve documents, videos, transcripts",
    meaning: "Define which knowledge sources are trusted for department-specific responses.",
    placeholder: "Approved sources include..."
  },
  {
    key: "excluded_content",
    title: "Exclude out-of-scope content",
    meaning: "Specify live systems, approvals, and transactional actions to exclude.",
    placeholder: "Excluded content includes..."
  },
  {
    key: "ingestion_indexing",
    title: "Ingest and index approved knowledge",
    meaning: "Define ingestion rules, indexing priorities, and refresh expectations.",
    placeholder: "Ingestion rules and indexing priorities are..."
  },
  {
    key: "guidance_only",
    title: "Configure guidance-only behavior (no actions)",
    meaning: "Force the agent to guide users without executing operational actions.",
    placeholder: "The agent provides guidance only and will not..."
  },
  {
    key: "guardrails",
    title: "Set guardrails and risk-warning language",
    meaning: "Define safe language for uncertainty, escalation, and compliance warnings.",
    placeholder: "Risk warning language should say..."
  },
  {
    key: "scenario_testing",
    title: "Test with real budget and Banner scenarios",
    meaning: "Document realistic test scenarios that represent department workflows.",
    placeholder: "Test scenarios include..."
  },
  {
    key: "validation_criteria",
    title: "Validate accuracy, tone, and safe failure responses",
    meaning: "Set acceptance criteria for quality and handling unknown answers.",
    placeholder: "Validation passes when..."
  },
  {
    key: "revision_plan",
    title: "Revise based on test feedback",
    meaning: "Define the process to improve prompts, sources, and behavior after testing.",
    placeholder: "Revision plan:"
  }
];

const adminTabs = [
  { id: "master", label: "Master Data" },
  { id: "users", label: "User Management" },
  { id: "roles", label: "Role Settings" },
  { id: "departments", label: "Departments" },
  { id: "documents", label: "Document Management" },
  { id: "wizard", label: "Agent Config Wizard" },
  { id: "assignments", label: "Agent Assignments" },
  { id: "ops", label: "Operations" }
];

const defaultRunFilters = {
  status: "ALL",
  runType: "ALL",
  dateFrom: "",
  dateTo: ""
};

const baseRunPresets = [
  { id: "all", label: "All Runs", filters: { ...defaultRunFilters } },
  { id: "errors", label: "Errors Only", filters: { ...defaultRunFilters, status: "error" } },
  { id: "document", label: "Document Runs", filters: { ...defaultRunFilters, runType: "document" } },
  { id: "scheduler", label: "Scheduler Runs", filters: { ...defaultRunFilters, runType: "scheduler" } }
];

function createWizardSteps(department) {
  return wizardStepTemplates.map((template, index) => ({
    id: index + 1,
    key: template.key,
    title: template.title,
    meaning: template.meaning,
    placeholder: template.placeholder,
    value:
      template.key === "purpose_scope"
        ? `Provide guidance for ${department} budget planning, policy interpretation, and compliant decision support.`
        : "",
    done: false
  }));
}

function createAgentConfig(id, name, department) {
  return {
    id,
    serverId: null,
    name,
    department,
    departmentCode: null,
    appliesToAll: true,
    selectedUserIds: [],
    isActive: true,
    scope: `Guidance-only assistant for ${department} budget workflows.`,
    riskLanguage: "I may be uncertain. Please confirm with Budget Office before final action.",
    steps: createWizardSteps(department)
  };
}

function mergeTemplateSteps(savedSteps, department) {
  const baseSteps = createWizardSteps(department);
  if (!savedSteps?.length) {
    return baseSteps;
  }

  const byKey = new Map(savedSteps.map((step) => [step.key, step]));
  return baseSteps.map((step) => {
    const saved = byKey.get(step.key);
    if (!saved) {
      return step;
    }

    return {
      ...step,
      title: saved.title || step.title,
      meaning: saved.meaning || step.meaning,
      placeholder: saved.placeholder || step.placeholder,
      value: saved.value || "",
      done: Boolean(saved.done),
      id: Number(saved.order) || step.id
    };
  });
}

function mapAgentConfigFromApi(agentConfig) {
  return {
    id: agentConfig.code,
    serverId: agentConfig.id,
    name: agentConfig.name,
    department: agentConfig.department,
    departmentCode: agentConfig.departmentCode,
    appliesToAll: agentConfig.appliesToAll,
    selectedUserIds: agentConfig.selectedUserIds || [],
    isActive: agentConfig.isActive !== false,
    scope: agentConfig.scope || "",
    riskLanguage: agentConfig.riskLanguage || "",
    steps: mergeTemplateSteps(agentConfig.steps || [], agentConfig.department)
  };
}

function toStepPayload(steps) {
  return (steps || []).map((step, index) => ({
    key: step.key,
    title: step.title,
    meaning: step.meaning,
    placeholder: step.placeholder || "",
    value: step.value || "",
    done: Boolean(step.done),
    order: index + 1
  }));
}

export default function AdminPanel({ authToken }) {
  const [activeTab, setActiveTab] = useState("master");
  const [adminMessage, setAdminMessage] = useState("");

  const [masterData, setMasterData] = useState(masterSeed);
  const [masterDataRecords, setMasterDataRecords] = useState({});
  const [masterTypeIds, setMasterTypeIds] = useState({});
  const [masterType, setMasterType] = useState(Object.keys(masterSeed)[0]);
  const [newMasterValue, setNewMasterValue] = useState("");
  const [newMasterType, setNewMasterType] = useState("");
  const [editingMasterTypeName, setEditingMasterTypeName] = useState("");
  const [editingMasterValue, setEditingMasterValue] = useState({ id: null, value: "" });

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [documents, setDocuments] = useState([]);
  const [documentDepartmentFilter, setDocumentDepartmentFilter] = useState("ALL");

  const [agentConfigs, setAgentConfigs] = useState([createAgentConfig("AG001", "Budget Policy Assistant", "Budget Office")]);
  const [activeAgentId, setActiveAgentId] = useState("AG001");
  const [activeWizardStepId, setActiveWizardStepId] = useState(1);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDepartment, setNewAgentDepartment] = useState("Budget Office");
  const [isSavingWizard, setIsSavingWizard] = useState(false);

  const [newDepartment, setNewDepartment] = useState({ name: "", owner: "", code: "" });
  const [editingDepartment, setEditingDepartment] = useState({
    id: null,
    name: "",
    owner: "",
    code: ""
  });

  const [confidenceThreshold, setConfidenceThreshold] = useState(72);
  const [humanReview, setHumanReview] = useState(true);
  const [mailboxAutoSync, setMailboxAutoSync] = useState(true);
  const [retentionDays, setRetentionDays] = useState(180);
  const [retrievalHealth, setRetrievalHealth] = useState(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [retrievalQuality, setRetrievalQuality] = useState(null);
  const [retrievalRuns, setRetrievalRuns] = useState([]);
  const [runFilters, setRunFilters] = useState(defaultRunFilters);
  const [selectedRunPresetId, setSelectedRunPresetId] = useState("all");
  const [serverRunPresets, setServerRunPresets] = useState([]);
  const [newRunPresetName, setNewRunPresetName] = useState("");
  const [newRunPresetShared, setNewRunPresetShared] = useState(false);
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [selectedDocForChunks, setSelectedDocForChunks] = useState(null);
  const [documentChunks, setDocumentChunks] = useState([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [isDocumentReindexing, setIsDocumentReindexing] = useState(false);

  const currentMasterItems = useMemo(() => masterDataRecords[masterType] || [], [masterDataRecords, masterType]);

  const departmentChoices = useMemo(
    () => [{ value: "ALL", label: "All Departments" }, ...departments.map((dept) => ({ value: dept.code, label: dept.name }))],
    [departments]
  );

  const filteredDocuments = useMemo(() => {
    if (documentDepartmentFilter === "ALL") {
      return documents;
    }

    return documents.filter((document) => document.departmentCode === documentDepartmentFilter);
  }, [documents, documentDepartmentFilter]);

  const activeAgent = useMemo(
    () => agentConfigs.find((agent) => agent.id === activeAgentId) || agentConfigs[0],
    [agentConfigs, activeAgentId]
  );

  const departmentUsers = useMemo(() => {
    if (!activeAgent) {
      return [];
    }

    return users.filter((user) => user.department === activeAgent.department);
  }, [users, activeAgent]);

  const assignedUsersForActiveAgent = useMemo(() => {
    if (!activeAgent) {
      return [];
    }

    return activeAgent.appliesToAll
      ? departmentUsers
      : departmentUsers.filter((user) => activeAgent.selectedUserIds.includes(user.id));
  }, [activeAgent, departmentUsers]);

  const departmentDocumentSummary = useMemo(() => {
    if (!activeAgent) {
      return { total: 0, approved: 0, domains: [] };
    }

    const scoped = documents.filter((document) => document.department === activeAgent.department);
    const approved = scoped.filter((document) => document.status === "Approved");
    const domains = [...new Set(approved.map((document) => document.domain))];

    return {
      total: scoped.length,
      approved: approved.length,
      domains
    };
  }, [activeAgent, documents]);

  const wizardProgress = useMemo(() => {
    if (!activeAgent) {
      return 0;
    }

    const complete = activeAgent.steps.filter((step) => step.done).length;
    return Math.round((complete / activeAgent.steps.length) * 100);
  }, [activeAgent]);

  const activeWizardStep = useMemo(() => {
    if (!activeAgent?.steps?.length) {
      return null;
    }

    return activeAgent.steps.find((step) => step.id === activeWizardStepId) || activeAgent.steps[0];
  }, [activeAgent, activeWizardStepId]);

  const assignmentRows = useMemo(() => {
    return agentConfigs.flatMap((agent) => {
      const allDepartmentUsers = users.filter((user) => user.department === agent.department);
      const assignedUsers = agent.appliesToAll
        ? allDepartmentUsers
        : allDepartmentUsers.filter((user) => agent.selectedUserIds.includes(user.id));

      return assignedUsers.map((user) => ({
        key: `${agent.id}-${user.id}`,
        agentName: agent.name,
        department: agent.department,
        userName: user.name,
        userEmail: user.email,
        assignmentMode: agent.appliesToAll ? "All Department Users" : "Selected Users"
      }));
    });
  }, [agentConfigs, users]);

  const setActiveAgentPatch = (updater) => {
    setAgentConfigs((previous) => previous.map((agent) => (agent.id === activeAgentId ? updater(agent) : agent)));
  };

  const loadRetrievalOpsData = async () => {
    const [healthResult, qualityResult, schedulerResult, runsResult, presetsResult] = await Promise.all([
      getRetrievalHealth(authToken),
      getRetrievalQuality(authToken),
      getRetrievalScheduler(authToken),
      getRetrievalRuns(authToken, 20),
      getRunFilterPresets(authToken)
    ]);

    setRetrievalHealth(healthResult.health || null);
    setRetrievalQuality(qualityResult.quality || null);
    setSchedulerConfig(schedulerResult.scheduler || null);
    setRetrievalRuns(runsResult.runs || []);
    setServerRunPresets(presetsResult.presets || []);
  };

  const loadCoreAdminData = async () => {
    const results = await Promise.allSettled([
      getAdminUsers(authToken),
      getDepartments(authToken),
      getDocuments(authToken),
      getMasterData(authToken),
      getRolePermissions(authToken),
      getAgentConfigurations(authToken)
    ]);

    const [usersResult, departmentsResult, documentsResult, masterDataResult, rolePermissionsResult, agentConfigsResult] = results;
    const errors = [];

    if (usersResult.status === "fulfilled") {
      const mappedUsers = (usersResult.value.users || []).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        departmentCode: user.department_code,
        role: user.role,
        active: user.is_active
      }));
      setUsers(mappedUsers);
    } else {
      errors.push("users");
    }

    let mappedDepartments = [];
    if (departmentsResult.status === "fulfilled") {
      mappedDepartments = (departmentsResult.value.departments || []).map((department) => ({
        id: department.id,
        name: department.name,
        owner: department.owner || "",
        code: department.code
      }));
      setDepartments(mappedDepartments);
      if (mappedDepartments.length > 0) {
        setNewAgentDepartment(mappedDepartments[0].name);
      }
    } else {
      errors.push("departments");
    }

    if (documentsResult.status === "fulfilled") {
      const mappedDocuments = (documentsResult.value.documents || []).map((document) => ({
        id: document.id,
        title: document.title,
        department: document.department,
        departmentCode: document.department_code,
        domain: document.domain,
        source: document.source_type,
        submittedBy: document.submitted_by_name,
        status: document.status
      }));
      setDocuments(mappedDocuments);
    } else {
      errors.push("documents");
    }

    if (masterDataResult.status === "fulfilled") {
      const mappedMasterData = {};
      const mappedMasterDataRecords = {};
      const mappedMasterTypeIds = {};
      for (const type of masterDataResult.value.types || []) {
        mappedMasterTypeIds[type.name] = type.id;
        const records = (type.values || []).map((value) => ({
          id: value.id,
          value: value.value
        }));
        mappedMasterData[type.name] = records.map((record) => record.value);
        mappedMasterDataRecords[type.name] = records;
      }
      if (Object.keys(mappedMasterData).length > 0) {
        setMasterData(mappedMasterData);
        setMasterDataRecords(mappedMasterDataRecords);
        setMasterTypeIds(mappedMasterTypeIds);
        const firstType = Object.keys(mappedMasterData)[0];
        setMasterType(firstType);
      }
    } else {
      errors.push("master-data");
    }

    if (rolePermissionsResult.status === "fulfilled") {
      const mappedRoles = (rolePermissionsResult.value.roles || []).map((role) => ({
        id: role.id,
        users: Number(role.users || 0),
        permissions: role.permissions || [],
        isActive: role.isActive !== false,
        isSystem: Boolean(role.isSystem),
        draftName: role.id
      }));
      setRoles(mappedRoles);
      setAvailablePermissions(rolePermissionsResult.value.availablePermissions || []);
    } else {
      errors.push("roles");
    }

    if (agentConfigsResult.status === "fulfilled") {
      const mappedAgentConfigs = (agentConfigsResult.value.agentConfigs || []).map(mapAgentConfigFromApi);
      if (mappedAgentConfigs.length > 0) {
        setAgentConfigs(mappedAgentConfigs);
        setActiveAgentId((previous) => {
          const exists = mappedAgentConfigs.some((agent) => agent.id === previous);
          return exists ? previous : mappedAgentConfigs[0].id;
        });
      }
    } else {
      errors.push("agent-configs");
    }

    try {
      await loadRetrievalOpsData();
    } catch (_error) {
      errors.push("operations");
    }

    if (errors.length > 0) {
      setAdminMessage(`Some admin sections failed to refresh: ${errors.join(", ")}.`);
    }
  };

  useEffect(() => {
    if (!authToken) {
      return;
    }

    loadCoreAdminData();
  }, [authToken]);

  useEffect(() => {
    setEditingMasterTypeName(masterType || "");
  }, [masterType]);

  useEffect(() => {
    if (!activeAgent?.steps?.length) {
      return;
    }

    setActiveWizardStepId((previous) => {
      const exists = activeAgent.steps.some((step) => step.id === previous);
      if (exists) {
        return previous;
      }

      const firstIncomplete = activeAgent.steps.find((step) => !step.done);
      return firstIncomplete ? firstIncomplete.id : activeAgent.steps[0].id;
    });
  }, [activeAgent]);

  const addMasterType = async () => {
    const typeName = newMasterType.trim();
    if (!typeName) {
      return;
    }

    try {
      const result = await createMasterType(authToken, { name: typeName });
      setMasterData((previous) => ({ ...previous, [typeName]: [] }));
      setMasterDataRecords((previous) => ({ ...previous, [typeName]: [] }));
      setMasterTypeIds((previous) => ({ ...previous, [typeName]: result.type.id }));
      setMasterType(typeName);
      setNewMasterType("");
      setAdminMessage("Master data type created.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to create master type.");
    }
  };

  const saveMasterTypeName = async () => {
    const nextName = editingMasterTypeName.trim();
    if (!nextName || !masterType || nextName === masterType) {
      return;
    }
    const typeId = masterTypeIds[masterType];

    if (!typeId) {
      setAdminMessage("Unable to identify selected master type id.");
      return;
    }

    try {
      await updateMasterType(authToken, typeId, { name: nextName });
      setMasterData((previous) => {
        const next = { ...previous };
        next[nextName] = next[masterType] || [];
        delete next[masterType];
        return next;
      });
      setMasterDataRecords((previous) => {
        const next = { ...previous };
        next[nextName] = next[masterType] || [];
        delete next[masterType];
        return next;
      });
      setMasterTypeIds((previous) => {
        const next = { ...previous };
        next[nextName] = next[masterType];
        delete next[masterType];
        return next;
      });
      setMasterType(nextName);
      setAdminMessage("Master data type updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update master type.");
    }
  };

  const removeMasterType = async () => {
    if (!masterType) {
      return;
    }

    const typeId = masterTypeIds[masterType];
    if (!typeId) {
      setAdminMessage("Unable to identify selected master type id.");
      return;
    }

    if (!window.confirm(`Delete master type "${masterType}" and all its values?`)) {
      return;
    }

    try {
      await deleteMasterType(authToken, typeId);
      setMasterData((previous) => {
        const next = { ...previous };
        delete next[masterType];
        return next;
      });
      setMasterDataRecords((previous) => {
        const next = { ...previous };
        delete next[masterType];
        return next;
      });
      setMasterTypeIds((previous) => {
        const next = { ...previous };
        delete next[masterType];
        return next;
      });
      const remainingTypes = Object.keys(masterData).filter((typeName) => typeName !== masterType);
      setMasterType(remainingTypes[0] || "");
      setAdminMessage("Master data type deleted.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to delete master type.");
    }
  };

  const addMasterValue = async () => {
    const value = newMasterValue.trim();
    if (!value) {
      return;
    }

    try {
      const result = await createMasterValue(authToken, { typeName: masterType, value });
      setMasterData((previous) => ({
        ...previous,
        [masterType]: previous[masterType]?.includes(result.value.value)
          ? previous[masterType]
          : [...(previous[masterType] || []), result.value.value]
      }));
      setMasterDataRecords((previous) => ({
        ...previous,
        [masterType]: [...(previous[masterType] || []), { id: result.value.id, value: result.value.value }]
      }));
      setNewMasterValue("");
      setAdminMessage("Master data value added.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to add master data value.");
    }
  };

  const startEditMasterValue = (record) => {
    setEditingMasterValue({ id: record.id, value: record.value });
  };

  const saveMasterValue = async () => {
    const nextValue = editingMasterValue.value.trim();
    if (!editingMasterValue.id || !nextValue) {
      return;
    }

    try {
      const result = await updateMasterValue(authToken, editingMasterValue.id, { value: nextValue });
      const updatedRecords = currentMasterItems.map((item) =>
        item.id === editingMasterValue.id ? { ...item, value: result.value.value } : item
      );
      setMasterData((previous) => ({
        ...previous,
        [masterType]: updatedRecords.map((item) => item.value)
      }));
      setMasterDataRecords((previous) => ({
        ...previous,
        [masterType]: updatedRecords
      }));
      setEditingMasterValue({ id: null, value: "" });
      setAdminMessage("Master data value updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update master data value.");
    }
  };

  const removeMasterItem = async (valueId, value) => {
    if (!window.confirm(`Delete value "${value}" from "${masterType}"?`)) {
      return;
    }

    try {
      await deleteMasterValue(authToken, valueId);
      setMasterData((previous) => ({
        ...previous,
        [masterType]: (previous[masterType] || []).filter((item) => item !== value)
      }));
      setMasterDataRecords((previous) => ({
        ...previous,
        [masterType]: (previous[masterType] || []).filter((item) => item.id !== valueId)
      }));
      if (editingMasterValue.id === valueId) {
        setEditingMasterValue({ id: null, value: "" });
      }
      setAdminMessage("Master data value deleted.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to delete master data value.");
    }
  };

  const toggleUserActive = async (userId) => {
    const target = users.find((user) => user.id === userId);
    if (!target) {
      return;
    }

    try {
      const result = await updateAdminUser(authToken, userId, { isActive: !target.active });
      const updated = result.user;

      setUsers((previous) =>
        previous.map((user) =>
          user.id === userId
            ? {
                ...user,
                active: updated.is_active,
                role: updated.role,
                department: updated.department,
                departmentCode: updated.department_code
              }
            : user
        )
      );
      setAdminMessage("User status updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update user status.");
    }
  };

  const updateUserRole = async (userId, roleId) => {
    try {
      const result = await updateAdminUser(authToken, userId, { role: roleId });
      const updated = result.user;

      setUsers((previous) =>
        previous.map((user) =>
          user.id === userId
            ? {
                ...user,
                role: updated.role,
                active: updated.is_active,
                department: updated.department,
                departmentCode: updated.department_code
              }
            : user
        )
      );
      setAdminMessage("User role updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update user role.");
    }
  };

  const updateUserDepartment = async (userId, departmentCode) => {
    try {
      const result = await updateAdminUser(authToken, userId, { departmentCode });
      const updated = result.user;

      setUsers((previous) =>
        previous.map((user) =>
          user.id === userId
            ? {
                ...user,
                role: updated.role,
                active: updated.is_active,
                department: updated.department,
                departmentCode: updated.department_code
              }
            : user
        )
      );
      setAdminMessage("User department updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update user department.");
    }
  };

  const createRoleRecord = async () => {
    const name = newRoleName.trim();
    if (!name) {
      setAdminMessage("Enter a role name.");
      return;
    }

    try {
      await createRole(authToken, { name });
      await loadCoreAdminData();
      setNewRoleName("");
      setAdminMessage("Role created.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to create role.");
    }
  };

  const patchRoleState = (roleId, patch) => {
    setRoles((previous) => previous.map((role) => (role.id === roleId ? { ...role, ...patch } : role)));
  };

  const saveRoleMeta = async (roleId) => {
    const role = roles.find((item) => item.id === roleId);
    if (!role) {
      return;
    }

    const payload = {};
    const nextName = role.draftName.trim();
    if (nextName && nextName !== role.id) {
      payload.name = nextName;
    }
    if (typeof role.isActive === "boolean") {
      payload.isActive = role.isActive;
    }

    if (Object.keys(payload).length === 0) {
      setAdminMessage("No role changes to save.");
      return;
    }

    try {
      await updateRole(authToken, role.id, payload);
      await loadCoreAdminData();
      setAdminMessage(`Role "${role.id}" updated.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to update role.");
    }
  };

  const deleteRoleRecord = async (roleId) => {
    const role = roles.find((item) => item.id === roleId);
    if (!role) {
      return;
    }

    if (!window.confirm(`Delete role "${roleId}"?`)) {
      return;
    }

    try {
      await deleteRole(authToken, roleId);
      await loadCoreAdminData();
      setAdminMessage(`Role "${roleId}" deleted.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to delete role.");
    }
  };

  const toggleRolePermission = (roleId, permission) => {
    setRoles((previous) =>
      previous.map((role) => {
        if (role.id !== roleId) {
          return role;
        }

        const hasPermission = role.permissions.includes(permission);
        return {
          ...role,
          permissions: hasPermission
            ? role.permissions.filter((item) => item !== permission)
            : [...role.permissions, permission]
        };
      })
    );
  };

  const saveRolePermissions = async (roleId) => {
    const role = roles.find((item) => item.id === roleId);
    if (!role) {
      return;
    }

    try {
      await updateRolePermissions(authToken, role.id, role.permissions);
      setAdminMessage(`Permissions updated for ${role.id}.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to update role permissions.");
    }
  };

  const addDepartment = async () => {
    const payload = {
      name: newDepartment.name.trim(),
      owner: newDepartment.owner.trim(),
      code: newDepartment.code.trim().toUpperCase()
    };

    if (!payload.name || !payload.owner || !payload.code) {
      return;
    }

    try {
      const result = await createDepartment(authToken, payload);
      const department = result.department;

      const mapped = {
        id: department.id,
        name: department.name,
        owner: department.owner || "",
        code: department.code
      };

      setDepartments((previous) => [mapped, ...previous]);
      setNewDepartment({ name: "", owner: "", code: "" });
      setNewAgentDepartment(mapped.name);
      setAdminMessage("Department created.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to create department.");
    }
  };

  const startEditDepartment = (department) => {
    setEditingDepartment({
      id: department.id,
      name: department.name,
      owner: department.owner || "",
      code: department.code
    });
  };

  const saveDepartment = async () => {
    if (!editingDepartment.id) {
      return;
    }

    const payload = {
      name: editingDepartment.name.trim(),
      owner: editingDepartment.owner.trim(),
      code: editingDepartment.code.trim().toUpperCase()
    };

    try {
      const result = await updateDepartment(authToken, editingDepartment.id, payload);
      const updated = {
        id: result.department.id,
        name: result.department.name,
        owner: result.department.owner || "",
        code: result.department.code
      };

      setDepartments((previous) =>
        previous.map((department) => (department.id === updated.id ? updated : department))
      );
      setEditingDepartment({ id: null, name: "", owner: "", code: "" });
      setAdminMessage("Department updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update department.");
    }
  };

  const removeDepartment = async (department) => {
    if (!window.confirm(`Delete department "${department.name}"?`)) {
      return;
    }

    try {
      await deleteDepartment(authToken, department.id);
      setDepartments((previous) => previous.filter((item) => item.id !== department.id));
      if (newAgentDepartment === department.name) {
        const nextDept = departments.find((item) => item.id !== department.id);
        if (nextDept) {
          setNewAgentDepartment(nextDept.name);
        }
      }
      setAdminMessage("Department deleted.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to delete department.");
    }
  };

  const handleDocumentDownload = async (documentId) => {
    try {
      const result = await downloadDocument(authToken, documentId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setAdminMessage(`Download failed: ${err.message}`);
    }
  };

  const updateDocumentDecision = async (documentId, status) => {
    try {
      await updateDocumentStatus(authToken, documentId, { status, reviewNote: "Updated from admin panel" });
      setDocuments((previous) => previous.map((doc) => (doc.id === documentId ? { ...doc, status } : doc)));
      setAdminMessage(`Document marked as ${status}.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to update document status.");
    }
  };

  const refreshRetrievalHealth = async () => {
    try {
      await loadRetrievalOpsData();
      setAdminMessage("Retrieval health refreshed.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to load retrieval health.");
    }
  };

  const runReindex = async () => {
    setIsReindexing(true);
    try {
      const result = await runRetrievalReindex(authToken);
      setAdminMessage(
        `Reindex completed: ${result.result?.indexedDocuments || 0} approved documents indexed using ${result.result?.provider || "unknown"} provider.`
      );
      await loadRetrievalOpsData();
    } catch (error) {
      setAdminMessage(error.message || "Unable to run reindex.");
    } finally {
      setIsReindexing(false);
    }
  };

  const loadDocumentChunks = async (documentId) => {
    setSelectedDocForChunks(documentId);
    setIsLoadingChunks(true);
    try {
      const result = await listDocumentChunks(authToken, documentId);
      setDocumentChunks(result.chunks || []);
      setAdminMessage(`Loaded ${result.chunks?.length || 0} chunks.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to load document chunks.");
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const runDocumentReindex = async (documentId) => {
    setSelectedDocForChunks(documentId);
    setIsDocumentReindexing(true);
    try {
      const result = await reindexDocumentChunks(authToken, documentId);
      setAdminMessage(
        `Document reindex completed. Indexed: ${result.result?.indexed ? "yes" : "no"} | Chunks: ${result.chunksCount || 0}.`
      );
      await loadDocumentChunks(documentId);
      await loadRetrievalOpsData();
    } catch (error) {
      setAdminMessage(error.message || "Unable to reindex selected document.");
    } finally {
      setIsDocumentReindexing(false);
    }
  };

  const updateScheduler = async (patch) => {
    if (!schedulerConfig) {
      return;
    }

    try {
      const payload = {
        enabled: patch.enabled ?? schedulerConfig.enabled,
        intervalMinutes: patch.intervalMinutes ?? schedulerConfig.intervalMinutes
      };
      const result = await updateRetrievalScheduler(authToken, payload);
      setSchedulerConfig(result.scheduler || schedulerConfig);
      setAdminMessage("Scheduler settings updated.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to update scheduler.");
    }
  };

  const vectorStatusChipClass = retrievalHealth?.vectorSearchEnabled ? "ready" : "hold";
  const vectorStatusLabel = retrievalHealth?.vectorSearchEnabled ? "SQL Vector Mode Active" : "JS Fallback Active";
  const runPresets = useMemo(
    () => [
      ...baseRunPresets,
      ...serverRunPresets.map((preset) => ({
        id: preset.id,
        label: preset.name,
        isCustom: true,
        isShared: preset.is_shared,
        filters: {
          status: preset.status_filter || "ALL",
          runType: preset.run_type_filter || "ALL",
          dateFrom: preset.date_from ? String(preset.date_from).slice(0, 10) : "",
          dateTo: preset.date_to ? String(preset.date_to).slice(0, 10) : ""
        }
      }))
    ],
    [serverRunPresets]
  );
  const selectedRunPreset = useMemo(
    () => runPresets.find((preset) => preset.id === selectedRunPresetId) || null,
    [runPresets, selectedRunPresetId]
  );

  const applyRunPreset = (preset) => {
    setRunFilters({
      status: preset.filters?.status || "ALL",
      runType: preset.filters?.runType || "ALL",
      dateFrom: preset.filters?.dateFrom || "",
      dateTo: preset.filters?.dateTo || ""
    });
    setSelectedRunPresetId(preset.id);
  };

  const saveCurrentRunPreset = () => {
    const name = newRunPresetName.trim();
    if (!name) {
      setAdminMessage("Enter a preset name before saving.");
      return;
    }

    createRunFilterPreset(authToken, {
      name,
      status: runFilters.status,
      runType: runFilters.runType,
      dateFrom: runFilters.dateFrom || undefined,
      dateTo: runFilters.dateTo || undefined,
      isShared: newRunPresetShared
    })
      .then((result) => {
        setServerRunPresets((previous) => [result.preset, ...previous]);
        setSelectedRunPresetId(result.preset.id);
        setNewRunPresetName("");
        setNewRunPresetShared(false);
        setAdminMessage(`Saved preset "${name}".`);
      })
      .catch((error) => {
        setAdminMessage(error.message || "Unable to save preset.");
      });
  };

  const deleteRunPreset = (presetId) => {
    deleteRunFilterPreset(authToken, presetId)
      .then(() => {
        setServerRunPresets((previous) => previous.filter((preset) => preset.id !== presetId));
        if (selectedRunPresetId === presetId) {
          setSelectedRunPresetId("all");
          setRunFilters(defaultRunFilters);
        }
        setAdminMessage("Preset deleted.");
      })
      .catch((error) => {
        setAdminMessage(error.message || "Unable to delete preset.");
      });
  };

  const filteredRetrievalRuns = useMemo(() => {
    return retrievalRuns.filter((run) => {
      if (runFilters.status !== "ALL" && run.status !== runFilters.status) {
        return false;
      }

      if (runFilters.runType !== "ALL" && run.run_type !== runFilters.runType) {
        return false;
      }

      const startedAt = run.started_at ? new Date(run.started_at).getTime() : null;
      if (runFilters.dateFrom && startedAt && startedAt < new Date(`${runFilters.dateFrom}T00:00:00`).getTime()) {
        return false;
      }

      if (runFilters.dateTo && startedAt && startedAt > new Date(`${runFilters.dateTo}T23:59:59`).getTime()) {
        return false;
      }

      return true;
    });
  }, [retrievalRuns, runFilters]);

  const exportRunsCsv = () => {
    const rows = filteredRetrievalRuns.map((run) => ({
      id: run.id,
      status: run.status,
      run_type: run.run_type,
      trigger: run.trigger,
      provider: run.provider || "",
      embedding_dimensions: run.embedding_dimensions || "",
      indexed_documents: run.indexed_documents || "",
      vector_search_enabled: run.vector_search_enabled,
      started_at: run.started_at || "",
      completed_at: run.completed_at || "",
      duration_ms: run.duration_ms || "",
      error_message: run.error_message || ""
    }));

    if (!rows.length) {
      setAdminMessage("No run history rows to export with current filters.");
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String(row[header] ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `retrieval-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setAdminMessage(`Exported ${rows.length} run rows to CSV.`);
  };

  const applyQuickDatePreset = (preset) => {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);

    if (preset === "today") {
      // same day
    } else if (preset === "last7") {
      from.setDate(from.getDate() - 6);
    } else if (preset === "last30") {
      from.setDate(from.getDate() - 29);
    } else if (preset === "clear") {
      setRunFilters((previous) => ({ ...previous, dateFrom: "", dateTo: "" }));
      setSelectedRunPresetId("custom-edit");
      return;
    }

    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);

    setRunFilters((previous) => ({
      ...previous,
      dateFrom: fromIso,
      dateTo: toIso
    }));
    setSelectedRunPresetId("custom-edit");
  };

  const updateWizardStepPatch = (stepId, patch) => {
    setActiveAgentPatch((agent) => ({
      ...agent,
      steps: agent.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
    }));
  };

  const buildAiStepDraft = (step, agent) => {
    const assignedUsers = agent.appliesToAll
      ? users.filter((user) => user.department === agent.department)
      : users.filter(
          (user) => user.department === agent.department && agent.selectedUserIds.includes(user.id)
        );
    const userLabel =
      assignedUsers.length > 0
        ? assignedUsers.slice(0, 4).map((user) => user.name).join(", ")
        : `all eligible ${agent.department} users`;
    const approvedDocs = documents.filter(
      (document) => document.department === agent.department && document.status === "Approved"
    );
    const approvedDomains = [...new Set(approvedDocs.map((document) => document.domain))];
    const domainsLabel = approvedDomains.length > 0 ? approvedDomains.join(", ") : "approved budget knowledge sources";

    switch (step.key) {
      case "purpose_scope":
        return `This ${agent.department} agent supports ${userLabel} with policy-grounded budget guidance, planning interpretation, and decision support based on ${domainsLabel}.`;
      case "hard_boundaries":
        return "The agent will not approve budgets, execute transactions, submit records to live systems, override policy, or provide legal/HR directives.";
      case "primary_user_needs":
        return `Primary users are ${userLabel}. Core needs: faster policy clarification, consistent budget response templates, and trusted references for department planning decisions.`;
      case "top_questions":
        return "Top tasks: explain budget policy rules, summarize fiscal constraints, compare historical patterns, draft response language, and route high-risk questions for human review.";
      case "approved_sources":
        return `Use approved sources from ${agent.department}: ${domainsLabel}. Include policy PDFs, approved memos, training transcripts, and validated department guidance notes.`;
      case "excluded_content":
        return "Exclude live ERP/Banner actions, approval routing, financial postings, credentialed system operations, and any out-of-department confidential records.";
      case "ingestion_indexing":
        return "Ingest approved files nightly, prioritize current fiscal-year policies, tag by domain and department, and reindex when approved content changes.";
      case "guidance_only":
        return "This agent is guidance-only: it can recommend next steps and draft responses, but cannot take actions, execute approvals, or update enterprise systems.";
      case "guardrails":
        return "Risk language: when confidence is low or data is missing, respond with limitations, cite available sources, and direct the user to Budget Office reviewer escalation.";
      case "scenario_testing":
        return `Test scenarios: annual budget request, mid-year variance question, Banner coding clarification, and policy exception inquiry for ${agent.department}.`;
      case "validation_criteria":
        return "Pass criteria: factual accuracy against sources, clear professional tone, citations on policy answers, and safe failure responses using 'I do not have enough verified information'.";
      case "revision_plan":
        return "Revision cycle: collect test feedback weekly, update prompts and boundaries, remove weak sources, retest top failing scenarios, and publish change notes.";
      default:
        return "";
    }
  };

  const generateAiForStep = (stepId) => {
    if (!activeAgent) {
      return;
    }

    const target = activeAgent.steps.find((step) => step.id === stepId);
    if (!target) {
      return;
    }

    const draft = buildAiStepDraft(target, activeAgent);
    updateWizardStepPatch(stepId, { value: draft, done: true });
    setAdminMessage(`AI drafted step ${stepId}: ${target.title}`);
  };

  const generateAiForAllSteps = () => {
    if (!activeAgent) {
      return;
    }

    setActiveAgentPatch((agent) => ({
      ...agent,
      steps: agent.steps.map((step) => ({
        ...step,
        value: step.value?.trim() ? step.value : buildAiStepDraft(step, agent),
        done: true
      }))
    }));
    setAdminMessage("AI drafted all wizard steps based on department and assigned users.");
  };

  const goToNextIncompleteStep = () => {
    if (!activeAgent?.steps?.length) {
      return;
    }

    const next = activeAgent.steps.find((step) => !step.done);
    setActiveWizardStepId(next ? next.id : activeAgent.steps[activeAgent.steps.length - 1].id);
  };

  const moveWizardStep = (direction) => {
    if (!activeAgent?.steps?.length) {
      return;
    }

    const currentIndex = activeAgent.steps.findIndex((step) => step.id === activeWizardStepId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), activeAgent.steps.length - 1);
    setActiveWizardStepId(activeAgent.steps[nextIndex].id);
  };

  const upsertActiveAgentState = (mappedAgent, previousLocalId = null) => {
    setAgentConfigs((previous) => {
      const filtered = previous.filter(
        (agent) => agent.id !== mappedAgent.id && (previousLocalId ? agent.id !== previousLocalId : true)
      );
      return [mappedAgent, ...filtered];
    });
    setActiveAgentId(mappedAgent.id);
  };

  const ensureActiveAgentPersisted = async () => {
    if (!activeAgent) {
      return null;
    }

    if (activeAgent.serverId) {
      return activeAgent;
    }

    const result = await createAgentConfiguration(authToken, {
      name: activeAgent.name,
      departmentName: activeAgent.department,
      appliesToAll: activeAgent.appliesToAll,
      userIds: activeAgent.selectedUserIds,
      scope: activeAgent.scope,
      riskLanguage: activeAgent.riskLanguage,
      steps: toStepPayload(activeAgent.steps)
    });

    const mapped = mapAgentConfigFromApi(result.agentConfig);
    upsertActiveAgentState(mapped, activeAgent.id);
    return mapped;
  };

  const saveActiveAgentProfile = async () => {
    if (!activeAgent) {
      return;
    }

    setIsSavingWizard(true);
    try {
      const persistedAgent = await ensureActiveAgentPersisted();
      if (!persistedAgent?.serverId) {
        return;
      }

      await updateAgentConfiguration(authToken, persistedAgent.serverId, {
        name: activeAgent.name,
        departmentName: activeAgent.department,
        appliesToAll: activeAgent.appliesToAll,
        scope: activeAgent.scope,
        riskLanguage: activeAgent.riskLanguage,
        isActive: activeAgent.isActive
      });

      const assignmentsResult = await replaceAgentAssignments(authToken, persistedAgent.serverId, {
        appliesToAll: activeAgent.appliesToAll,
        userIds: activeAgent.selectedUserIds
      });

      const stepsResult = await replaceAgentSteps(authToken, persistedAgent.serverId, {
        steps: toStepPayload(activeAgent.steps)
      });

      const latest = mapAgentConfigFromApi(stepsResult.agentConfig || assignmentsResult.agentConfig);
      upsertActiveAgentState(latest, activeAgent.id);
      setAdminMessage("Agent wizard saved to server.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to save agent wizard.");
    } finally {
      setIsSavingWizard(false);
    }
  };

  const saveCurrentWizardStep = async () => {
    if (!activeAgent || !activeWizardStep) {
      return;
    }

    setIsSavingWizard(true);
    try {
      const persistedAgent = await ensureActiveAgentPersisted();
      if (!persistedAgent?.serverId) {
        return;
      }

      const result = await replaceAgentSteps(authToken, persistedAgent.serverId, {
        steps: toStepPayload(activeAgent.steps)
      });
      const latest = mapAgentConfigFromApi(result.agentConfig);
      upsertActiveAgentState(latest, activeAgent.id);
      setAdminMessage(`Saved step ${activeWizardStep.id}.`);
    } catch (error) {
      setAdminMessage(error.message || "Unable to save wizard step.");
    } finally {
      setIsSavingWizard(false);
    }
  };

  const saveAssignmentsOnly = async () => {
    if (!activeAgent) {
      return;
    }

    setIsSavingWizard(true);
    try {
      const persistedAgent = await ensureActiveAgentPersisted();
      if (!persistedAgent?.serverId) {
        return;
      }

      const result = await replaceAgentAssignments(authToken, persistedAgent.serverId, {
        appliesToAll: activeAgent.appliesToAll,
        userIds: activeAgent.selectedUserIds
      });
      const latest = mapAgentConfigFromApi(result.agentConfig);
      upsertActiveAgentState(latest, activeAgent.id);
      setAdminMessage("Agent assignments saved.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to save assignments.");
    } finally {
      setIsSavingWizard(false);
    }
  };

  const createAgentWizard = async () => {
    const name = newAgentName.trim();
    if (!name || !newAgentDepartment) {
      return;
    }

    const template = createAgentConfig(`TMP-${Date.now()}`, name, newAgentDepartment);

    setIsSavingWizard(true);
    try {
      const result = await createAgentConfiguration(authToken, {
        name,
        departmentName: newAgentDepartment,
        appliesToAll: true,
        scope: template.scope,
        riskLanguage: template.riskLanguage,
        steps: toStepPayload(template.steps)
      });

      const mapped = mapAgentConfigFromApi(result.agentConfig);
      upsertActiveAgentState(mapped);
      setActiveWizardStepId(1);
      setNewAgentName("");
      setActiveTab("wizard");
      setAdminMessage("Agent wizard created and saved.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to create agent wizard.");
    } finally {
      setIsSavingWizard(false);
    }
  };

  const removeActiveAgent = async () => {
    if (!activeAgent) {
      return;
    }

    if (agentConfigs.length === 1) {
      setAdminMessage("At least one agent configuration must remain.");
      return;
    }

    if (!window.confirm(`Delete agent "${activeAgent.name}"?`)) {
      return;
    }

    setIsSavingWizard(true);
    try {
      if (activeAgent.serverId) {
        await deleteAgentConfiguration(authToken, activeAgent.serverId);
      }

      const remaining = agentConfigs.filter((agent) => agent.id !== activeAgent.id);
      setAgentConfigs(remaining);
      setActiveAgentId(remaining[0].id);
      setAdminMessage("Agent configuration deleted.");
    } catch (error) {
      setAdminMessage(error.message || "Unable to delete agent configuration.");
    } finally {
      setIsSavingWizard(false);
    }
  };

  const toggleWizardStep = (stepId) => {
    const target = activeAgent?.steps?.find((step) => step.id === stepId);
    if (!target) {
      return;
    }

    updateWizardStepPatch(stepId, { done: !target.done });
  };

  const toggleSelectedUser = (userId) => {
    setActiveAgentPatch((agent) => {
      const exists = agent.selectedUserIds.includes(userId);

      return {
        ...agent,
        selectedUserIds: exists
          ? agent.selectedUserIds.filter((id) => id !== userId)
          : [...agent.selectedUserIds, userId]
      };
    });
  };

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Admin Management Center</h2>
        <p>Control governance, approvals, and safe rollout settings before backend automation is enabled.</p>
      </div>

      {adminMessage && <p className="section-caption">{adminMessage}</p>}

      <div className="knowledge-tabs" role="tablist" aria-label="Admin sections">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "master" && (
        <section className="setup-card tab-content">
          <h3>Dropdown Master Data Management</h3>
          <div className="config-grid three-col">
            <label className="field">
              <span>Add New Master Type</span>
              <div className="inline-input">
                <input
                  type="text"
                  value={newMasterType}
                  onChange={(event) => setNewMasterType(event.target.value)}
                  placeholder="Ex: Project Priority"
                />
                <button type="button" className="action-btn" onClick={addMasterType}>
                  Create
                </button>
              </div>
            </label>
            <label className="field">
              <span>Master Type</span>
              <select value={masterType} onChange={(event) => setMasterType(event.target.value)}>
                {Object.keys(masterData).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Edit Selected Type Name</span>
              <div className="inline-input">
                <input
                  type="text"
                  value={editingMasterTypeName}
                  onChange={(event) => setEditingMasterTypeName(event.target.value)}
                  placeholder="Update type name"
                />
                <button type="button" className="action-btn" onClick={saveMasterTypeName}>
                  Save
                </button>
                <button type="button" className="mini-btn reject" onClick={removeMasterType}>
                  Delete Type
                </button>
              </div>
            </label>
          </div>

          <div className="config-grid two-col">
            <label className="field">
              <span>Add New Value</span>
              <div className="inline-input">
                <input
                  type="text"
                  value={newMasterValue}
                  onChange={(event) => setNewMasterValue(event.target.value)}
                  placeholder={`New ${masterType} value`}
                />
                <button type="button" className="action-btn" onClick={addMasterValue}>
                  Add
                </button>
              </div>
            </label>
          </div>

          <div className="list-box">
            {currentMasterItems.length === 0 && <p>No values found for this type.</p>}
            {currentMasterItems.map((item) => (
              <div className="manage-row" key={item.id}>
                {editingMasterValue.id === item.id ? (
                  <input
                    type="text"
                    value={editingMasterValue.value}
                    onChange={(event) =>
                      setEditingMasterValue((previous) => ({ ...previous, value: event.target.value }))
                    }
                  />
                ) : (
                  <span>{item.value}</span>
                )}

                <div className="action-group">
                  {editingMasterValue.id === item.id ? (
                    <>
                      <button type="button" className="mini-btn approve" onClick={saveMasterValue}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => setEditingMasterValue({ id: null, value: "" })}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="mini-btn" onClick={() => startEditMasterValue(item)}>
                      Edit
                    </button>
                  )}
                  <button type="button" className="mini-btn reject" onClick={() => removeMasterItem(item.id, item.value)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "users" && (
        <section className="setup-card tab-content">
          <h3>User Management</h3>
          <div className="queue-table">
            <div className="queue-row queue-head admin-users-head">
              <span>User</span>
              <span>Email</span>
              <span>Department</span>
              <span>Role</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {users.map((user) => (
              <div className="queue-row admin-users-row" key={user.id}>
                <span>{user.name}</span>
                <span>{user.email}</span>
                <select
                  value={user.departmentCode || ""}
                  onChange={(event) => updateUserDepartment(user.id, event.target.value)}
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.code}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <select value={user.role} onChange={(event) => updateUserRole(user.id, event.target.value)}>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.id}
                    </option>
                  ))}
                </select>
                <label className="admin-toggle">
                  <input type="checkbox" checked={user.active} onChange={() => toggleUserActive(user.id)} />
                  {user.active ? "Active" : "Inactive"}
                </label>
                <div className="action-group">
                  <button type="button" className="mini-btn hold" onClick={() => toggleUserActive(user.id)}>
                    {user.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "roles" && (
        <section className="setup-card tab-content">
          <h3>Role Settings</h3>
          <div className="inline-actions">
            <input
              type="text"
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              placeholder="Create new role (e.g. Finance Reviewer)"
            />
            <button type="button" className="action-btn" onClick={createRoleRecord}>
              Add Role
            </button>
          </div>
          <div className="queue-table">
            <div className="queue-row queue-head admin-roles-head">
              <span>Role</span>
              <span>Assigned Users</span>
              <span>Status</span>
              <span>Permissions</span>
              <span>Actions</span>
            </div>
            {roles.map((role) => (
              <div className="queue-row admin-roles-row" key={role.id}>
                <div className="field">
                  <input
                    type="text"
                    value={role.draftName}
                    disabled={role.isSystem}
                    onChange={(event) => patchRoleState(role.id, { draftName: event.target.value })}
                  />
                </div>
                <span>{role.users}</span>
                <label className="admin-toggle">
                  <input
                    type="checkbox"
                    checked={role.isActive}
                    disabled={role.isSystem}
                    onChange={(event) => patchRoleState(role.id, { isActive: event.target.checked })}
                  />
                  {role.isActive ? "Active" : "Inactive"}
                </label>
                <span>
                  <div className="chip-row">
                    {availablePermissions.map((permission) => (
                      <label key={`${role.id}-${permission}`} className="pill">
                        <input
                          type="checkbox"
                          checked={role.permissions.includes(permission)}
                          onChange={() => toggleRolePermission(role.id, permission)}
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                </span>
                <div className="action-group">
                  <button type="button" className="mini-btn approve" onClick={() => saveRolePermissions(role.id)}>
                    Save Permissions
                  </button>
                  <button type="button" className="mini-btn" onClick={() => saveRoleMeta(role.id)}>
                    Save Role
                  </button>
                  {!role.isSystem && (
                    <button type="button" className="mini-btn reject" onClick={() => deleteRoleRecord(role.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "departments" && (
        <section className="setup-card tab-content">
          <h3>Department Management</h3>
          <div className="config-grid three-col">
            <label className="field">
              <span>Department Name</span>
              <input
                type="text"
                value={newDepartment.name}
                onChange={(event) => setNewDepartment((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Ex: Workforce Development"
              />
            </label>
            <label className="field">
              <span>Owner</span>
              <input
                type="text"
                value={newDepartment.owner}
                onChange={(event) => setNewDepartment((previous) => ({ ...previous, owner: event.target.value }))}
                placeholder="Ex: VP Workforce"
              />
            </label>
            <label className="field">
              <span>Code</span>
              <div className="inline-input">
                <input
                  type="text"
                  value={newDepartment.code}
                  onChange={(event) => setNewDepartment((previous) => ({ ...previous, code: event.target.value }))}
                  placeholder="WRK"
                />
                <button type="button" className="action-btn" onClick={addDepartment}>
                  Add
                </button>
              </div>
            </label>
          </div>

          <div className="queue-table">
            <div className="queue-row queue-head admin-dept-head">
              <span>ID</span>
              <span>Department</span>
              <span>Owner</span>
              <span>Code</span>
              <span>Actions</span>
            </div>
            {departments.map((department) => (
              <div className="queue-row admin-dept-row" key={department.id}>
                <span>{department.id}</span>
                {editingDepartment.id === department.id ? (
                  <>
                    <input
                      type="text"
                      value={editingDepartment.name}
                      onChange={(event) =>
                        setEditingDepartment((previous) => ({ ...previous, name: event.target.value }))
                      }
                    />
                    <input
                      type="text"
                      value={editingDepartment.owner}
                      onChange={(event) =>
                        setEditingDepartment((previous) => ({ ...previous, owner: event.target.value }))
                      }
                    />
                    <input
                      type="text"
                      value={editingDepartment.code}
                      onChange={(event) =>
                        setEditingDepartment((previous) => ({ ...previous, code: event.target.value }))
                      }
                    />
                    <div className="action-group">
                      <button type="button" className="mini-btn approve" onClick={saveDepartment}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => setEditingDepartment({ id: null, name: "", owner: "", code: "" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{department.name}</span>
                    <span>{department.owner}</span>
                    <span>{department.code}</span>
                    <div className="action-group">
                      <button type="button" className="mini-btn" onClick={() => startEditDepartment(department)}>
                        Edit
                      </button>
                      <button type="button" className="mini-btn reject" onClick={() => removeDepartment(department)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "documents" && (
        <section className="setup-card tab-content">
          <h3>Document Management for LLM Training Approval</h3>
          <p className="section-caption">Admin can review all collected sources department-wise and approve, reject, or hold for future training.</p>

          <div className="config-grid two-col">
            <label className="field">
              <span>Department Filter</span>
              <select value={documentDepartmentFilter} onChange={(event) => setDocumentDepartmentFilter(event.target.value)}>
                {departmentChoices.map((department) => (
                  <option key={department.value} value={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="queue-table">
            <div className="queue-row queue-head admin-doc-head">
              <span>Document</span>
              <span>Department</span>
              <span>Domain</span>
              <span>Source</span>
              <span>Status</span>
              <span>Decision</span>
            </div>
            {filteredDocuments.map((document) => (
              <div className="queue-row admin-doc-row" key={document.id}>
                <span className="doc-title-cell" data-tooltip={document.title}>{document.title}</span>
                <span>{document.department}</span>
                <span>{document.domain}</span>
                <span>{document.source}</span>
                <span>
                  <span className={`status-chip ${document.status.toLowerCase()}`}>{document.status}</span>
                </span>
                <div className="action-group">
                  <button type="button" className="mini-btn approve" onClick={() => updateDocumentDecision(document.id, "Approved")}>Approve</button>
                  <button type="button" className="mini-btn hold" onClick={() => updateDocumentDecision(document.id, "Hold")}>Hold</button>
                  <button type="button" className="mini-btn reject" onClick={() => updateDocumentDecision(document.id, "Rejected")}>Reject</button>
                  <button type="button" className="mini-btn" onClick={() => loadDocumentChunks(document.id)}>
                    Chunks
                  </button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => runDocumentReindex(document.id)}
                    disabled={isDocumentReindexing && selectedDocForChunks === document.id}
                  >
                    {isDocumentReindexing && selectedDocForChunks === document.id ? "Reindexing..." : "Reindex Doc"}
                  </button>
                  {document.source === "Upload" && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => handleDocumentDownload(document.id)}
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedDocForChunks && (
            <section className="setup-card nested-card">
              <h3>Document Chunk Preview</h3>
              {isLoadingChunks && <p className="section-caption">Loading chunks...</p>}
              {!isLoadingChunks && documentChunks.length === 0 && <p className="section-caption">No chunks found.</p>}
              {!isLoadingChunks && documentChunks.length > 0 && (
                <div className="list-box">
                  {documentChunks.map((chunk) => (
                    <p key={chunk.id}>
                      Chunk {chunk.chunk_index + 1} | tokens {chunk.token_count} | {chunk.embedding_provider}
                      <br />
                      {chunk.content.slice(0, 180)}...
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      )}

      {activeTab === "wizard" && activeAgent && (
        <section className="setup-card tab-content">
          <h3>Agent Configuration Wizard</h3>
          <p className="section-caption">Create multiple agents, select department users, and configure scope and safety before backend enablement.</p>

          <div className="config-grid two-col">
            <label className="field">
              <span>Create New Agent Name</span>
              <input
                type="text"
                value={newAgentName}
                onChange={(event) => setNewAgentName(event.target.value)}
                placeholder="Ex: Academic Budget Assistant"
              />
            </label>
            <label className="field">
              <span>Department for New Agent</span>
              <div className="inline-input">
                <select value={newAgentDepartment} onChange={(event) => setNewAgentDepartment(event.target.value)}>
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>{department.name}</option>
                  ))}
                </select>
                <button type="button" className="action-btn" onClick={createAgentWizard} disabled={isSavingWizard}>
                  {isSavingWizard ? "Saving..." : "Create Agent"}
                </button>
                <button type="button" className="mini-btn reject" onClick={removeActiveAgent} disabled={isSavingWizard}>
                  Delete Active
                </button>
              </div>
            </label>
          </div>

          <div className="agent-switcher">
            <p className="section-caption">Configured Agents</p>
            <div className="chip-row">
              {agentConfigs.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`chip-btn ${agent.id === activeAgent.id ? "active" : ""}`}
                  onClick={() => setActiveAgentId(agent.id)}
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </div>

          <div className="wizard-summary">
            <strong>{activeAgent.name} | Completion: {wizardProgress}%</strong>
            <span>{activeAgent.steps.filter((step) => step.done).length}/{activeAgent.steps.length} steps completed</span>
          </div>

          <section className="setup-card nested-card">
            <h3>Department Context</h3>
            <div className="config-grid two-col">
              <label className="field">
                <span>Agent Name</span>
                <input
                  type="text"
                  value={activeAgent.name}
                  onChange={(event) => setActiveAgentPatch((agent) => ({ ...agent, name: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Department</span>
                <select
                  value={activeAgent.department}
                  onChange={(event) => {
                    const department = departments.find((item) => item.name === event.target.value);
                    setActiveAgentPatch((agent) => ({
                      ...agent,
                      department: event.target.value,
                      departmentCode: department?.code || null,
                      selectedUserIds: [],
                      steps: createWizardSteps(event.target.value)
                    }));
                  }}
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="metric-strip">
              <div>
                <p>Assigned Users</p>
                <strong>{assignedUsersForActiveAgent.length}</strong>
              </div>
              <div>
                <p>Department Documents</p>
                <strong>{departmentDocumentSummary.total}</strong>
              </div>
              <div>
                <p>Approved Sources</p>
                <strong>{departmentDocumentSummary.approved}</strong>
              </div>
              <div>
                <p>Domains Covered</p>
                <strong>{departmentDocumentSummary.domains.length}</strong>
              </div>
            </div>

            <div className="chip-row">
              {(departmentDocumentSummary.domains.length > 0
                ? departmentDocumentSummary.domains
                : ["No approved domains yet"]).map((domain) => (
                <span key={`${activeAgent.id}-${domain}`} className="pill">
                  {domain}
                </span>
              ))}
            </div>

            <div className="inline-actions">
              <button type="button" className="action-btn" onClick={generateAiForAllSteps}>
                AI Draft All Steps
              </button>
              <button type="button" className="mini-btn" onClick={goToNextIncompleteStep}>
                Go To Next Incomplete
              </button>
              <button type="button" className="mini-btn approve" onClick={saveActiveAgentProfile} disabled={isSavingWizard}>
                {isSavingWizard ? "Saving..." : "Save Wizard"}
              </button>
            </div>
          </section>

          <section className="setup-card nested-card">
            <h3>User Assignment for This Agent</h3>
            <div className="toggle-row">
              <label>
                <input
                  type="radio"
                  name="assignment-mode"
                  checked={activeAgent.appliesToAll}
                  onChange={() => setActiveAgentPatch((agent) => ({ ...agent, appliesToAll: true, selectedUserIds: [] }))}
                />
                Apply to all users in {activeAgent.department}
              </label>
              <label>
                <input
                  type="radio"
                  name="assignment-mode"
                  checked={!activeAgent.appliesToAll}
                  onChange={() => setActiveAgentPatch((agent) => ({ ...agent, appliesToAll: false }))}
                />
                Assign to selected users only
              </label>
            </div>

            <div className="user-pick-grid">
              {departmentUsers.length === 0 && <p className="empty-queue">No users found in selected department.</p>}
              {departmentUsers.map((user) => (
                <label key={user.id} className={`user-pick ${activeAgent.selectedUserIds.includes(user.id) ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={activeAgent.appliesToAll || activeAgent.selectedUserIds.includes(user.id)}
                    disabled={activeAgent.appliesToAll}
                    onChange={() => toggleSelectedUser(user.id)}
                  />
                  <span>{user.name} | {user.email}</span>
                </label>
              ))}
            </div>
            <div className="inline-actions">
              <button type="button" className="mini-btn approve" onClick={saveAssignmentsOnly} disabled={isSavingWizard}>
                {isSavingWizard ? "Saving..." : "Save Assignments"}
              </button>
            </div>
          </section>

          <div className="wizard-workbench">
            <aside className="wizard-nav">
              {activeAgent.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  className={`wizard-nav-btn ${activeWizardStep?.id === step.id ? "active" : ""} ${step.done ? "done" : ""}`}
                  onClick={() => setActiveWizardStepId(step.id)}
                >
                  <small>Step {step.id}</small>
                  <strong>{step.title}</strong>
                </button>
              ))}
            </aside>

            {activeWizardStep && (
              <section className="wizard-editor">
                <p className="eyebrow">Step {activeWizardStep.id}</p>
                <h3>{activeWizardStep.title}</h3>
                <p className="section-caption">{activeWizardStep.meaning}</p>

                <label className="field">
                  <span>Admin Configuration</span>
                  <textarea
                    rows={6}
                    value={activeWizardStep.value}
                    placeholder={activeWizardStep.placeholder}
                    onChange={(event) => updateWizardStepPatch(activeWizardStep.id, { value: event.target.value })}
                  />
                </label>

                <div className="inline-actions">
                  <button type="button" className="mini-btn" onClick={() => generateAiForStep(activeWizardStep.id)}>
                    AI Suggest For This Step
                  </button>
                  <button type="button" className="mini-btn approve" onClick={saveCurrentWizardStep} disabled={isSavingWizard}>
                    {isSavingWizard ? "Saving..." : "Save Step"}
                  </button>
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={activeWizardStep.done}
                      onChange={() => toggleWizardStep(activeWizardStep.id)}
                    />
                    Mark Step Complete
                  </label>
                  <button type="button" className="mini-btn" onClick={() => moveWizardStep(-1)}>
                    Previous
                  </button>
                  <button type="button" className="mini-btn approve" onClick={() => moveWizardStep(1)}>
                    Next
                  </button>
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {activeTab === "assignments" && (
        <section className="setup-card tab-content">
          <h3>Agent-to-User Assignment View</h3>
          <p className="section-caption">Track which agents are assigned to which users by department.</p>

          <div className="queue-table">
            <div className="queue-row queue-head admin-assign-head">
              <span>Agent</span>
              <span>Department</span>
              <span>User</span>
              <span>Email</span>
              <span>Mode</span>
            </div>
            {assignmentRows.length === 0 && <p className="empty-queue">No user assignments created yet.</p>}
            {assignmentRows.map((row) => (
              <div className="queue-row admin-assign-row" key={row.key}>
                <span>{row.agentName}</span>
                <span>{row.department}</span>
                <span>{row.userName}</span>
                <span>{row.userEmail}</span>
                <span>{row.assignmentMode}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "ops" && (
        <section className="setup-card tab-content">
          <h3>Platform Operations</h3>
          <div className="config-grid two-col">
            <label className="field">
              <span>Low-Confidence Escalation Threshold: {confidenceThreshold}%</span>
              <input type="range" min="50" max="95" value={confidenceThreshold} onChange={(event) => setConfidenceThreshold(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Audit Retention (days)</span>
              <input type="number" min="30" max="730" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} />
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input type="checkbox" checked={humanReview} onChange={(event) => setHumanReview(event.target.checked)} />
              Require human review for low-confidence answers
            </label>
            <label>
              <input type="checkbox" checked={mailboxAutoSync} onChange={(event) => setMailboxAutoSync(event.target.checked)} />
              Enable automatic email ingestion sync
            </label>
          </div>

          {schedulerConfig && (
            <section className="setup-card nested-card">
              <h3>Scheduled Reindex</h3>
              <div className="config-grid two-col">
                <label className="field">
                  <span>Enable Scheduler</span>
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={schedulerConfig.enabled}
                      onChange={(event) => updateScheduler({ enabled: event.target.checked })}
                    />
                    {schedulerConfig.enabled ? "Enabled" : "Disabled"}
                  </label>
                </label>
                <label className="field">
                  <span>Interval (minutes)</span>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={schedulerConfig.intervalMinutes}
                    onChange={(event) =>
                      setSchedulerConfig((previous) => ({
                        ...previous,
                        intervalMinutes: Number(event.target.value)
                      }))
                    }
                    onBlur={() => updateScheduler({ intervalMinutes: schedulerConfig.intervalMinutes })}
                  />
                </label>
              </div>
              <div className="metric-strip">
                <div>
                  <p>Scheduler Status</p>
                  <strong>{schedulerConfig.status}</strong>
                </div>
                <div>
                  <p>Last Run</p>
                  <strong>{schedulerConfig.lastRunAt ? new Date(schedulerConfig.lastRunAt).toLocaleString() : "N/A"}</strong>
                </div>
                <div>
                  <p>Next Run</p>
                  <strong>{schedulerConfig.nextRunAt ? new Date(schedulerConfig.nextRunAt).toLocaleString() : "N/A"}</strong>
                </div>
              </div>
            </section>
          )}

          <div className="inline-actions">
            <button type="button" className="action-btn" onClick={runReindex} disabled={isReindexing}>
              {isReindexing ? "Reindexing..." : "Run Knowledge Reindex"}
            </button>
            <button type="button" className="action-btn" onClick={refreshRetrievalHealth}>
              Refresh Retrieval Health
            </button>
          </div>

          {retrievalHealth && (
            <>
              <div className="wizard-summary">
                <strong>Retrieval Runtime Status</strong>
                <span className={`status-chip ${vectorStatusChipClass}`}>{vectorStatusLabel}</span>
              </div>

              <div className="metric-strip">
                <div>
                  <p>Vector Extension</p>
                  <strong>{retrievalHealth.extensionInstalled ? "Installed" : "Not Installed"}</strong>
                </div>
                <div>
                  <p>Vector Column</p>
                  <strong>{retrievalHealth.vectorColumnExists ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <p>Vector Index</p>
                  <strong>{retrievalHealth.vectorIndexExists ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <p>Configured Provider</p>
                  <strong>{retrievalHealth.configuredProvider}</strong>
                </div>
                <div>
                  <p>Configured Model</p>
                  <strong>{retrievalHealth.configuredModel}</strong>
                </div>
                <div>
                  <p>Approved Documents</p>
                  <strong>{retrievalHealth.approvedDocuments}</strong>
                </div>
                <div>
                  <p>Total Chunks</p>
                  <strong>{retrievalHealth.totalChunks}</strong>
                </div>
              </div>

              {retrievalQuality && (
                <section className="setup-card nested-card">
                  <h3>Retrieval Quality Metrics</h3>
                  <div className="metric-strip">
                    <div>
                      <p>Total User Turns</p>
                      <strong>{retrievalQuality.totalUserTurns}</strong>
                    </div>
                    <div>
                      <p>Assistant Turns</p>
                      <strong>{retrievalQuality.assistantTurns}</strong>
                    </div>
                    <div>
                      <p>Voice Turns</p>
                      <strong>{retrievalQuality.voiceTurns}</strong>
                    </div>
                    <div>
                      <p>Citation Coverage</p>
                      <strong>{retrievalQuality.citationCoveragePct}%</strong>
                    </div>
                    <div>
                      <p>Low Confidence</p>
                      <strong>{retrievalQuality.lowConfidenceRatePct}%</strong>
                    </div>
                  </div>
                  <div className="list-box compact">
                    {(retrievalQuality.topQueries || []).map((entry) => (
                      <p key={entry.query}>
                        {entry.query} | {entry.count}x
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {retrievalRuns.length > 0 && (
                <section className="setup-card nested-card">
                  <h3>Recent Reindex Runs</h3>
                  <div className="chip-row">
                    {runPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`chip-btn ${selectedRunPresetId === preset.id ? "active" : ""}`}
                        onClick={() => applyRunPreset(preset)}
                      >
                        {preset.label}
                        {preset.isShared ? " (Shared)" : ""}
                      </button>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <input
                      type="text"
                      value={newRunPresetName}
                      onChange={(event) => setNewRunPresetName(event.target.value)}
                      placeholder="Save current filters as..."
                    />
                    <button type="button" className="action-btn" onClick={saveCurrentRunPreset}>
                      Save Preset
                    </button>
                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={newRunPresetShared}
                        onChange={(event) => setNewRunPresetShared(event.target.checked)}
                      />
                      Save as shared preset
                    </label>
                    {selectedRunPreset?.isCustom && (
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => deleteRunPreset(selectedRunPresetId)}
                      >
                        Delete Preset
                      </button>
                    )}
                  </div>
                  <div className="config-grid three-col">
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={runFilters.status}
                        onChange={(event) =>
                          setRunFilters((previous) => {
                            setSelectedRunPresetId("custom-edit");
                            return { ...previous, status: event.target.value };
                          })
                        }
                      >
                        <option value="ALL">All</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Run Type</span>
                      <select
                        value={runFilters.runType}
                        onChange={(event) =>
                          setRunFilters((previous) => {
                            setSelectedRunPresetId("custom-edit");
                            return { ...previous, runType: event.target.value };
                          })
                        }
                      >
                        <option value="ALL">All</option>
                        <option value="scheduler">Scheduler</option>
                        <option value="manual-full">Manual Full</option>
                        <option value="manual-scheduler-run">Manual Scheduler Run</option>
                        <option value="document">Document</option>
                      </select>
                    </label>
                    <div className="inline-actions">
                      <button type="button" className="action-btn" onClick={exportRunsCsv}>
                        Export CSV
                      </button>
                    </div>
                  </div>
                  <div className="config-grid two-col">
                    <label className="field">
                      <span>Date From</span>
                      <input
                        type="date"
                        value={runFilters.dateFrom}
                        onChange={(event) =>
                          setRunFilters((previous) => {
                            setSelectedRunPresetId("custom-edit");
                            return { ...previous, dateFrom: event.target.value };
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Date To</span>
                      <input
                        type="date"
                        value={runFilters.dateTo}
                        onChange={(event) =>
                          setRunFilters((previous) => {
                            setSelectedRunPresetId("custom-edit");
                            return { ...previous, dateTo: event.target.value };
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="chip-row">
                    <button type="button" className="chip-btn" onClick={() => applyQuickDatePreset("today")}>
                      Today
                    </button>
                    <button type="button" className="chip-btn" onClick={() => applyQuickDatePreset("last7")}>
                      Last 7 Days
                    </button>
                    <button type="button" className="chip-btn" onClick={() => applyQuickDatePreset("last30")}>
                      Last 30 Days
                    </button>
                    <button type="button" className="chip-btn" onClick={() => applyQuickDatePreset("clear")}>
                      Clear Dates
                    </button>
                  </div>
                  <div className="list-box compact">
                    {filteredRetrievalRuns.map((run) => (
                      <p key={run.id}>
                        <span className={`status-chip ${run.status === "success" ? "ready" : "rejected"}`}>
                          {run.status}
                        </span>{" "}
                        {run.run_type} | {run.trigger} | {run.provider || "n/a"} |{" "}
                        {run.duration_ms != null ? `${run.duration_ms}ms` : "n/a"} |{" "}
                        {run.started_at ? new Date(run.started_at).toLocaleString() : "n/a"}
                        {run.error_message ? ` | ${run.error_message}` : ""}
                      </p>
                    ))}
                    {filteredRetrievalRuns.length === 0 && <p>No runs match current filters.</p>}
                  </div>
                </section>
              )}

              {!retrievalHealth.vectorSearchEnabled && (
                <div className="setup-card nested-card">
                  <h3>Enable pgvector SQL Mode</h3>
                  <p className="section-caption">
                    1) In an Administrator terminal with Visual C++ tools, build pgvector for PostgreSQL 18:
                    <br />
                    <code>set "PGROOT=C:\Program Files\PostgreSQL\18"</code>
                    <br />
                    <code>git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git</code>
                    <br />
                    <code>cd pgvector && nmake /F Makefile.win && nmake /F Makefile.win install</code>
                    <br />
                    2) Run <code>npm run enable-vector</code>, 3) run <code>npm run reindex</code>, 4) click Refresh Retrieval Health.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </article>
  );
}
