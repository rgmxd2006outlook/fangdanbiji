import { useEffect, useMemo, useState } from "react";
import { backupToCloud, decryptAppData, encryptAppData, listCloudBackups, restoreFromCloud } from "./backup";
import { loadData, saveData } from "./storage";
import type { AppData, Idea, Material, Review, TabKey, Tag, Task, TaskAction, TaskStep, TaskUpdateLog } from "./types";
import { daysAgo, formatTime, nowIso, searchAll, shouldTriggerDailyReminder, similarity, uid } from "./utils";

type DraftMap = Record<string, { taskId: string; action: string }>;

type DuePreset = "permanent" | "1" | "3" | "7" | "custom";

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bp_theme_mode") === "dark";
    } catch {
      return false;
    }
  });
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterTagId, setFilterTagId] = useState("");
  const [openConvertedIdeas, setOpenConvertedIdeas] = useState(false);
  const [openProcessedCollect, setOpenProcessedCollect] = useState(false);
  const [openFutureCollect, setOpenFutureCollect] = useState(false);

  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDetail, setIdeaDetail] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [forWhomWhy, setForWhomWhy] = useState("");
  const [successMetric, setSuccessMetric] = useState("");
  const [obstacles, setObstacles] = useState("");
  const [openTaskCreate, setOpenTaskCreate] = useState(false);

  const [ideaActionDrafts, setIdeaActionDrafts] = useState<Record<string, { taskId: string; content: string }>>({});

  const [archiveTemplateName, setArchiveTemplateName] = useState("");
  const [archiveExperience, setArchiveExperience] = useState("");

  const [reviewEffectiveAction, setReviewEffectiveAction] = useState("");
  const [reviewObstacle, setReviewObstacle] = useState("");
  const [reviewAdjustment, setReviewAdjustment] = useState("");

  const [customTagName, setCustomTagName] = useState("");

  const [stashTitle, setStashTitle] = useState("");
  const [stashContent, setStashContent] = useState("");
  const [stashLinksInput, setStashLinksInput] = useState("");
  const [stashFiles, setStashFiles] = useState<File[]>([]);
  const [duePreset, setDuePreset] = useState<DuePreset>("permanent");
  const [dueCustomDate, setDueCustomDate] = useState("");
  const [stashDrafts, setStashDrafts] = useState<DraftMap>({});
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupRecords, setBackupRecords] = useState<Array<{ id: string; createdAt: string; size: number; version: string }>>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [qqPulling, setQqPulling] = useState(false);
  const [qqSending, setQqSending] = useState(false);
  const [qqDraftSender, setQqDraftSender] = useState("系统测试");
  const [qqDraftText, setQqDraftText] = useState("");
  const [qqLastPullAt, setQqLastPullAt] = useState("");
  const [qqBotToken, setQqBotToken] = useState("");
  const [qqBotConfigLoading, setQqBotConfigLoading] = useState(false);
  const [qqBotTokenFromEnv, setQqBotTokenFromEnv] = useState(false);
  const [futureEditTargetId, setFutureEditTargetId] = useState<string | null>(null);
  const [futureEditTitle, setFutureEditTitle] = useState("");
  const [futureEditContent, setFutureEditContent] = useState("");

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    try {
      localStorage.setItem("bp_theme_mode", darkMode ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    void loadQqBotConfig();
  }, []);

  useEffect(() => {
    const activeTasks = data.tasks.filter((t) => t.status === "active");
    if (!selectedTaskId && activeTasks.length > 0) {
      setSelectedTaskId(activeTasks[0].id);
    }
    if (selectedTaskId && !activeTasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(activeTasks[0]?.id ?? null);
    }
  }, [data.tasks, selectedTaskId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setData((prev) => {
        let next = prev;
        const today = localDateKey(new Date());

        if (shouldTriggerDailyReminder(prev.config.ideaReminderTime, prev.config.lastIdeaReminderDate)) {
          const count = prev.ideas.filter((i) => i.status === "unprocessed").length;
          if (count > 0) {
            window.alert(`今日灵感处理提醒：还有 ${count} 条未转化灵感。`);
          }
          next = {
            ...next,
            config: {
              ...next.config,
              lastIdeaReminderDate: today
            }
          };
        }

        if (next.config.lastStashReminderDate !== today) {
          const pending = next.stashes.filter((s) => s.status === "pending");
          const tomorrowCount = pending.filter((s) => daysUntil(s.dueAt) === 1).length;
          const todayCount = pending.filter((s) => daysUntil(s.dueAt) === 0).length;
          const overdueCount = pending.filter((s) => daysUntil(s.dueAt) < 0).length;

          if (tomorrowCount + todayCount + overdueCount > 0) {
            window.alert(`暂存提醒：明日到期 ${tomorrowCount} 条，今日到期 ${todayCount} 条，逾期 ${overdueCount} 条。`);
          }

          next = {
            ...next,
            config: {
              ...next.config,
              lastStashReminderDate: today
            }
          };
        }

        if (next.config.lastReviewReminderDate !== today) {
          const reviewNeeded = next.tasks.filter((t) => daysAgo(t.createdAt) >= 7 && t.reviews.length === 0).length;
          if (reviewNeeded > 0) {
            window.alert(`覆盘提醒：有 ${reviewNeeded} 个任务执行已超过 7 天，建议补充覆盘。`);
          }
          next = {
            ...next,
            config: {
              ...next.config,
              lastReviewReminderDate: today
            }
          };
        }

        if (next.config.lastCleanupDate !== today) {
          const overdueIdeaCount = next.ideas.filter((i) => i.status === "unprocessed" && daysAgo(i.createdAt) > 30).length;
          if (overdueIdeaCount > 0) {
            const shouldDelete = window.confirm(
              `发现 ${overdueIdeaCount} 条灵感超过 30 天未处理，是否立即删除这些灵感？`
            );
            if (shouldDelete) {
              next = {
                ...next,
                ideas: next.ideas.filter((i) => !(i.status === "unprocessed" && daysAgo(i.createdAt) > 30))
              };
            }
          }

          const before = next.stashes.length;
          next = {
            ...next,
            stashes: next.stashes.filter(
              (s) => !(s.status === "pending" && !s.relatedTaskId && daysAgo(s.createdAt) > 15)
            ),
            config: {
              ...next.config,
              lastCleanupDate: today
            }
          };
          const cleaned = before - next.stashes.length;
          if (cleaned > 0) {
            window.alert(`已自动清理 ${cleaned} 条超过 15 天未处理的暂存内容。`);
          }
        }

        return next;
      });
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  const activeTasks = useMemo(() => data.tasks.filter((t) => t.status === "active"), [data.tasks]);
  const unprocessedIdeas = useMemo(() => data.ideas.filter((i) => i.status === "unprocessed"), [data.ideas]);
  const selectedTask = useMemo(() => activeTasks.find((t) => t.id === selectedTaskId) ?? null, [activeTasks, selectedTaskId]);
  const results = useMemo(() => searchAll(data, query), [data, query]);
  const pendingStashes = useMemo(
    () => data.stashes.filter((s) => s.status === "pending").sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [data.stashes]
  );
  const processedStashes = useMemo(
    () =>
      data.stashes
        .filter((s) => s.status === "processed")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.stashes]
  );
  const futureStashes = useMemo(
    () =>
      data.stashes
        .filter((s) => s.status === "future")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.stashes]
  );
  const pendingIdeasList = useMemo(
    () =>
      data.ideas
        .filter((i) => i.status === "unprocessed")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.ideas]
  );
  const convertedIdeasList = useMemo(
    () =>
      data.ideas
        .filter((i) => i.status === "converted")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.ideas]
  );
  const ideaConversionDetails = useMemo(() => {
    const map: Record<string, Array<{ taskTitle: string; actionContent: string; convertedAt: string; source: string }>> = {};
    for (const task of data.tasks) {
      for (const action of task.actions) {
        if (!action.ideaId) {
          continue;
        }
        if (!map[action.ideaId]) {
          map[action.ideaId] = [];
        }
        map[action.ideaId].push({
          taskTitle: task.title,
          actionContent: action.content,
          convertedAt: action.createdAt,
          source: "进行中任务"
        });
      }
    }
    for (const archive of data.archives) {
      for (const action of archive.taskSnapshot.actions) {
        if (!action.ideaId) {
          continue;
        }
        if (!map[action.ideaId]) {
          map[action.ideaId] = [];
        }
        map[action.ideaId].push({
          taskTitle: archive.originTaskTitle,
          actionContent: action.content,
          convertedAt: action.createdAt,
          source: "归档任务"
        });
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.convertedAt).getTime() - new Date(a.convertedAt).getTime());
    }
    return map;
  }, [data.tasks, data.archives]);

  const selectedFilterTag = useMemo(
    () => data.tags.find((tag) => tag.id === filterTagId) ?? null,
    [data.tags, filterTagId]
  );
  const filteredActions = useMemo(
    () =>
      !filterTagId
        ? []
        : activeTasks.flatMap((task) =>
            task.actions
              .filter((action) => action.tagIds.includes(filterTagId) && action.status !== "done")
              .map((action) => ({ task, action }))
          ),
    [activeTasks, filterTagId]
  );

  const dashboardMetrics = useMemo(() => {
    const totalIdeas = data.ideas.filter((i) => i.status !== "deleted").length;
    const convertedIdeas = data.ideas.filter((i) => i.status === "converted").length;
    const totalTasks = data.tasks.length + data.archives.length;
    const doneTasks = data.archives.length;
    const reuseCount = data.archives.reduce((sum, item) => sum + item.reuseCount, 0);

    return {
      ideaRate: totalIdeas === 0 ? 0 : Math.round((convertedIdeas / totalIdeas) * 100),
      taskRate: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
      reuseCount
    };
  }, [data]);

  const trend = useMemo(() => {
    const labels: string[] = [];
    const ideas: number[] = [];
    const tasks: number[] = [];
    const archives: number[] = [];

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = localDateKey(d);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      ideas.push(data.ideas.filter((x) => localDateKey(new Date(x.createdAt)) === k).length);
      tasks.push(data.tasks.filter((x) => localDateKey(new Date(x.createdAt)) === k).length);
      archives.push(data.archives.filter((x) => localDateKey(new Date(x.archivedAt)) === k).length);
    }

    return { labels, ideas, tasks, archives };
  }, [data]);

  function updateData(updater: (prev: AppData) => AppData): void {
    setData((prev) => updater(prev));
  }

  function addIdea(): void {
    const title = ideaTitle.trim();
    const detail = ideaDetail.trim();

    if (!title) {
      window.alert("灵感标题必填");
      return;
    }
    if (title.length > 50 || detail.length > 200) {
      window.alert("请检查字数限制：标题 <= 50，详情 <= 200");
      return;
    }

    const idea: Idea = {
      id: uid("idea"),
      title,
      detail,
      status: "unprocessed",
      createdAt: nowIso()
    };

    updateData((prev) => ({
      ...prev,
      ideas: [idea, ...prev.ideas]
    }));

    setIdeaTitle("");
    setIdeaDetail("");
  }

  function createTask(): void {
    const title = taskTitle.trim();
    if (!title) {
      window.alert("任务标题必填");
      return;
    }
    if (title.length > 50 || forWhomWhy.length > 100 || successMetric.length > 100 || obstacles.length > 100) {
      window.alert("请检查字数限制");
      return;
    }

    const hit = activeTasks.find((t) => similarity(t.title, title) >= 0.8);
    if (hit) {
      const proceed = window.confirm(`检测到相似任务「${hit.title}」，是否继续新建？建议优先更新已有任务。`);
      if (!proceed) {
        setSelectedTaskId(hit.id);
        setTab("tasks");
        return;
      }
    }

    const now = nowIso();
    const task: Task = {
      id: uid("task"),
      title,
      forWhomWhy: forWhomWhy.trim(),
      successMetric: successMetric.trim(),
      obstacles: obstacles.trim(),
      tagIds: [],
      status: "active",
      createdAt: now,
      updatedAt: now,
      steps: [],
      actions: [],
      materials: [],
      reviews: [],
      logs: []
    };

    updateData((prev) => ({
      ...prev,
      tasks: [task, ...prev.tasks]
    }));

    setTaskTitle("");
    setForWhomWhy("");
    setSuccessMetric("");
    setObstacles("");
    setSelectedTaskId(task.id);
    setOpenTaskCreate(false);
    setTab("tasks");
  }

  function convertIdeaToAction(ideaId: string): void {
    const draft = ideaActionDrafts[ideaId] ?? { taskId: "", content: "" };
    const taskId = draft.taskId || selectedTaskId;
    if (!taskId) {
      window.alert("请先选择任务");
      return;
    }

    const content = draft.content.trim();
    if (!content || content.length > 100) {
      window.alert("行动内容必填，且需 <= 100 字");
      return;
    }

    updateData((prev) => {
      const action: TaskAction = {
        id: uid("action"),
        content,
        ideaId,
        noteEntries: [],
        status: "todo",
        tagIds: [],
        createdAt: nowIso()
      };

      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) {
            return t;
          }
          return {
            ...t,
            updatedAt: nowIso(),
        actions: [action, ...t.actions]
          };
        }),
        ideas: prev.ideas.map((i) => {
          if (i.id === ideaId) {
            return { ...i, status: "converted" };
          }
          return i;
        })
      };
    });

    setIdeaActionDrafts((prev) => ({ ...prev, [ideaId]: { taskId: "", content: "" } }));
  }

  function updateTaskField(taskId: string, field: "title" | "forWhomWhy" | "successMetric" | "obstacles", value: string): void {
    if ((field === "title" && value.length > 50) || (field !== "title" && value.length > 100)) {
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const oldValue = String(t[field] ?? "");
        const newValue = value;
        if (oldValue === newValue) {
          return t;
        }
        const now = nowIso();
        const latest = t.logs[0];
        const canMergeLatest = Boolean(latest && latest.field === field);
        const nextLog: TaskUpdateLog = canMergeLatest
          ? {
              ...latest,
              at: now,
              oldValue: latest.oldValue ?? oldValue,
              newValue
            }
          : {
              id: uid("log"),
              field,
              at: now,
              oldValue,
              newValue
            };
        const nextLogs = canMergeLatest ? [nextLog, ...t.logs.slice(1)] : [nextLog, ...t.logs];
        return {
          ...t,
          [field]: value,
          updatedAt: now,
          logs: nextLogs
        };
      })
    }));
  }

  function addActionToTask(
    taskId: string,
    content: string,
    tagIds: string[],
    anchorActionId?: string,
    position: "before" | "after" = "after",
    source?: { ideaId?: string; stashId?: string },
    stepId?: string
  ): void {
    const c = content.trim();
    if (!c || c.length > 100) {
      window.alert("行动内容必填，且 <= 100 字");
      return;
    }
    if (tagIds.length > 3) {
      window.alert("行动最多 3 个标签");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const nextAction: TaskAction = {
          id: uid("action"),
          content: c,
          ideaId: source?.ideaId,
          stashId: source?.stashId,
          stepId,
          noteEntries: [],
          status: "todo",
          tagIds,
          createdAt: nowIso()
        };
        if (!anchorActionId) {
          return {
            ...t,
            updatedAt: nowIso(),
            actions: [...t.actions, nextAction]
          };
        }
        const anchorIndex = t.actions.findIndex((a) => a.id === anchorActionId);
        if (anchorIndex < 0) {
          return {
            ...t,
            updatedAt: nowIso(),
            actions: [...t.actions, nextAction]
          };
        }
        if (!stepId) {
          nextAction.stepId = t.actions[anchorIndex]?.stepId;
        }
        const insertAt = position === "before" ? anchorIndex : anchorIndex + 1;
        const nextActions = [...t.actions];
        nextActions.splice(insertAt, 0, nextAction);
        return {
          ...t,
          updatedAt: nowIso(),
          actions: nextActions
        };
      })
    }));
  }

  function addTaskStep(taskId: string, name: string): void {
    const n = name.trim();
    if (!n) {
      window.alert("步骤名称不能为空");
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        if (t.steps.some((s) => s.name === n)) {
          window.alert("步骤名称已存在");
          return t;
        }
        const step: TaskStep = {
          id: uid("step"),
          name: n,
          createdAt: nowIso()
        };
        return {
          ...t,
          updatedAt: nowIso(),
          steps: [...t.steps, step]
        };
      })
    }));
  }

  function updateActionStep(taskId: string, actionId: string, stepId: string): void {
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const validStep = stepId === "" || t.steps.some((s) => s.id === stepId);
        if (!validStep) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.map((a) => (a.id === actionId ? { ...a, stepId: stepId || undefined } : a))
        };
      })
    }));
  }

  function reorderAction(taskId: string, draggedActionId: string, targetActionId: string): void {
    if (!draggedActionId || !targetActionId || draggedActionId === targetActionId) {
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const fromIndex = t.actions.findIndex((a) => a.id === draggedActionId);
        const toIndex = t.actions.findIndex((a) => a.id === targetActionId);
        if (fromIndex < 0 || toIndex < 0) {
          return t;
        }
        const targetStepId = t.actions[toIndex]?.stepId;
        const nextActions = [...t.actions];
        const [moved] = nextActions.splice(fromIndex, 1);
        nextActions.splice(toIndex, 0, { ...moved, stepId: targetStepId });
        return {
          ...t,
          updatedAt: nowIso(),
          actions: nextActions
        };
      })
    }));
  }

  function moveActionToStep(taskId: string, draggedActionId: string, stepId?: string): void {
    if (!draggedActionId) {
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const fromIndex = t.actions.findIndex((a) => a.id === draggedActionId);
        if (fromIndex < 0) {
          return t;
        }
        const nextActions = [...t.actions];
        const [moved] = nextActions.splice(fromIndex, 1);
        const movedWithStep = { ...moved, stepId };
        const lastSameStepIndex = (() => {
          let idx = -1;
          for (let i = 0; i < nextActions.length; i += 1) {
            const same = (nextActions[i].stepId ?? undefined) === stepId;
            if (same) {
              idx = i;
            }
          }
          return idx;
        })();
        const insertAt = lastSameStepIndex >= 0 ? lastSameStepIndex + 1 : nextActions.length;
        nextActions.splice(insertAt, 0, movedWithStep);
        return {
          ...t,
          updatedAt: nowIso(),
          actions: nextActions
        };
      })
    }));
  }

  function addMaterialLink(taskId: string, actionId: string, name: string, url: string): void {
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) {
      window.alert("资料名称和链接都必填");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: [
            {
              id: uid("material"),
              actionId,
              type: "link",
              name: n,
              url: u,
              createdAt: nowIso()
            },
            ...t.materials
          ]
        };
      })
    }));
  }

  function addMaterialText(taskId: string, actionId: string, name: string, content: string, type: "text" | "code"): void {
    const n = name.trim();
    const c = content.trim();
    if (!n || !c) {
      window.alert(type === "code" ? "代码资料名称和内容都必填" : "文字资料名称和内容都必填");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: [
            {
              id: uid("material"),
              actionId,
              type,
              name: n,
              content: c,
              createdAt: nowIso()
            },
            ...t.materials
          ]
        };
      })
    }));
  }

  function addMaterialImage(taskId: string, actionId: string, name: string, url: string): void {
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) {
      window.alert("图片资料名称和图片地址都必填");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: [
            {
              id: uid("material"),
              actionId,
              type: "image",
              name: n,
              url: u,
              createdAt: nowIso()
            },
            ...t.materials
          ]
        };
      })
    }));
  }

  function addMaterialFile(taskId: string, actionId: string, file: File): void {
    if (file.size > 50 * 1024 * 1024) {
      window.alert("文件超过 50MB 限制");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) {
        window.alert("文件读取失败");
        return;
      }

      updateData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) {
            return t;
          }
          return {
            ...t,
            updatedAt: nowIso(),
            materials: [
              {
                id: uid("material"),
                actionId,
                type: "file",
                name: file.name,
                fileMeta: {
                  size: file.size,
                  mime: file.type || "application/octet-stream",
                  dataUrl
                },
                createdAt: nowIso()
              },
              ...t.materials
            ]
          };
        })
      }));
    };
    reader.readAsDataURL(file);
  }

  function updateMaterial(
    taskId: string,
    materialId: string,
    patch: Partial<Pick<Material, "name" | "url" | "content">>
  ): void {
    const name = patch.name?.trim();
    const url = patch.url?.trim();
    const content = patch.content?.trim();
    if (patch.name !== undefined && !name) {
      window.alert("资料名称不能为空");
      return;
    }
    if (patch.url !== undefined && !url) {
      window.alert("资料链接不能为空");
      return;
    }
    if (patch.content !== undefined && !content) {
      window.alert("资料内容不能为空");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: t.materials.map((m) =>
            m.id === materialId
              ? {
                  ...m,
                  ...(patch.name !== undefined ? { name } : {}),
                  ...(patch.url !== undefined ? { url } : {}),
                  ...(patch.content !== undefined ? { content } : {})
                }
              : m
          )
        };
      })
    }));
  }

  function deleteMaterial(taskId: string, materialId: string): void {
    const sure = window.confirm("确定删除该资料？");
    if (!sure) {
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: t.materials.filter((m) => m.id !== materialId)
        };
      })
    }));
  }

  function reassignMaterialToAction(taskId: string, materialId: string, targetActionId: string): void {
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        const actionExists = t.actions.some((a) => a.id === targetActionId);
        if (!actionExists) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          materials: t.materials.map((m) => (m.id === materialId ? { ...m, actionId: targetActionId } : m))
        };
      })
    }));
  }

  function toggleAction(taskId: string, actionId: string): void {
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.map((a) => (a.id === actionId ? { ...a, status: a.status === "done" ? "todo" : "done" } : a))
        };
      })
    }));
  }

  function updateActionTags(taskId: string, actionId: string, tagIds: string[]): void {
    if (tagIds.length > 3) {
      window.alert("行动最多 3 个标签");
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.map((a) => (a.id === actionId ? { ...a, tagIds } : a))
        };
      })
    }));
  }

  function addActionNote(taskId: string, actionId: string, note: string): void {
    const nextNote = note.trim();
    if (!nextNote) {
      return;
    }
    if (nextNote.length > 2000) {
      window.alert("单条行动笔记最多 2000 字");
      return;
    }
    const now = nowIso();
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: now,
          actions: t.actions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  note: nextNote,
                  noteEntries: [{ id: uid("note"), content: nextNote, createdAt: now }, ...(a.noteEntries ?? [])]
                }
              : a
          )
        };
      })
    }));
  }

  function deleteActionNote(taskId: string, actionId: string, noteId: string): void {
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.map((a) => {
            if (a.id !== actionId) {
              return a;
            }
            const nextEntries = (a.noteEntries ?? []).filter((n) => n.id !== noteId);
            return {
              ...a,
              noteEntries: nextEntries,
              note: nextEntries[0]?.content ?? ""
            };
          })
        };
      })
    }));
  }

  function updateActionNoteEntry(taskId: string, actionId: string, noteId: string, content: string): void {
    const nextContent = content.trim();
    if (!nextContent) {
      window.alert("笔记内容不能为空");
      return;
    }
    if (nextContent.length > 2000) {
      window.alert("单条行动笔记最多 2000 字");
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.map((a) => {
            if (a.id !== actionId) {
              return a;
            }
            const nextEntries = (a.noteEntries ?? []).map((n) => (n.id === noteId ? { ...n, content: nextContent } : n));
            return {
              ...a,
              noteEntries: nextEntries,
              note: nextEntries[0]?.content ?? ""
            };
          })
        };
      })
    }));
  }

  function deleteAction(taskId: string, actionId: string): void {
    const sure = window.confirm("确定删除该行动？");
    if (!sure) {
      return;
    }

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) {
          return t;
        }
        return {
          ...t,
          updatedAt: nowIso(),
          actions: t.actions.filter((a) => a.id !== actionId),
          materials: t.materials.filter((m) => m.actionId !== actionId)
        };
      })
    }));
  }

  function addReview(task: Task): void {
    const effectiveAction = reviewEffectiveAction.trim();
    const actualObstacle = reviewObstacle.trim();
    const adjustment = reviewAdjustment.trim();

    if (!effectiveAction || !actualObstacle || !adjustment) {
      window.alert("覆盘三项均需填写");
      return;
    }
    if (effectiveAction.length > 100 || actualObstacle.length > 100 || adjustment.length > 100) {
      window.alert("覆盘每项最多 100 字");
      return;
    }

    const review: Review = {
      id: uid("review"),
      effectiveAction,
      actualObstacle,
      adjustment,
      createdAt: nowIso()
    };

    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, reviews: [review, ...t.reviews], updatedAt: nowIso() } : t))
    }));

    setReviewEffectiveAction("");
    setReviewObstacle("");
    setReviewAdjustment("");
  }

  function archiveTask(task: Task): void {
    const templateName = archiveTemplateName.trim();
    const coreExperience = archiveExperience.trim();

    if (!templateName || !coreExperience) {
      window.alert("归档必填：模板名称 + 核心经验");
      return;
    }
    if (templateName.length > 30 || coreExperience.length > 200) {
      window.alert("请检查字数限制");
      return;
    }

    const sure = window.confirm("确认完成归档？归档后任务将移出核心任务库。");
    if (!sure) {
      return;
    }

    updateData((prev) => {
      const archive = {
        id: uid("archive"),
        originTaskId: task.id,
        originTaskTitle: task.title,
        templateName,
        coreExperience,
        archivedAt: nowIso(),
        taskSnapshot: { ...task, status: "archived" as const },
        reuseCount: 0
      };

      return {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== task.id),
        archives: [archive, ...prev.archives]
      };
    });

    setArchiveTemplateName("");
    setArchiveExperience("");
    setSelectedTaskId(null);
  }

  function deleteIdea(id: string): void {
    const sure = window.confirm("确定删除该灵感？");
    if (!sure) {
      return;
    }

    updateData((prev) => ({
      ...prev,
      ideas: prev.ideas.map((i) => (i.id === id ? { ...i, status: "deleted" } : i))
    }));
  }

  function jumpToResult(refId: string, module: string): void {
    if (module === "idea") {
      setTab("collect");
      return;
    }
    if (module === "archive") {
      setTab("archives");
      return;
    }
    if (module === "stash") {
      setTab("collect");
      return;
    }
    setTab("tasks");
    setSelectedTaskId(refId);
  }

  function addCustomTag(): void {
    const name = customTagName.trim();
    if (!name) {
      return;
    }

    const customCount = data.tags.filter((t) => !t.system).length;
    if (customCount >= 10) {
      window.alert("自定义标签最多 10 个");
      return;
    }
    if (data.tags.some((t) => t.name === name)) {
      window.alert("标签已存在");
      return;
    }

    updateData((prev) => ({
      ...prev,
      tags: [...prev.tags, { id: uid("tag"), name, system: false }]
    }));

    setCustomTagName("");
  }

  function removeCustomTag(tag: Tag): void {
    if (tag.system) {
      return;
    }

    const sure = window.confirm(`删除标签「${tag.name}」？`);
    if (!sure) {
      return;
    }

    updateData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t.id !== tag.id),
      tasks: prev.tasks.map((task) => ({
        ...task,
        tagIds: task.tagIds.filter((id) => id !== tag.id),
        actions: task.actions.map((a) => ({ ...a, tagIds: a.tagIds.filter((id) => id !== tag.id) }))
      }))
    }));
  }

  function addStash(): void {
    let title = stashTitle.trim();
    const contentText = stashContent.trim();
    if (!title) {
      title = contentText.slice(0, 20) || stashFiles[0]?.name || `收集_${new Date().toLocaleDateString("zh-CN")}`;
    }
    if (title.length > 50 || contentText.length > 5000) {
      window.alert("请检查内容长度");
      return;
    }

    const dueAt = resolveDueAt(duePreset, dueCustomDate);
    if (!dueAt) {
      window.alert("请设置有效处理期限");
      return;
    }

    const links = stashLinksInput
      .split(/\n|,|\s+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const readFiles = Promise.all(
      stashFiles.map(
        (file) =>
          new Promise<{ name: string; mime: string; size: number; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                mime: file.type || "application/octet-stream",
                size: file.size,
                dataUrl: String(reader.result ?? "")
              });
            };
            reader.onerror = () => reject(new Error("文件读取失败"));
            reader.readAsDataURL(file);
          })
      )
    );

    void readFiles
      .then((fileEntries) => {
        updateData((prev) => ({
          ...prev,
          stashes: [
            {
              id: uid("stash"),
              title,
              contentText,
              links,
              files: fileEntries,
              source: "manual",
              dueAt,
              status: "pending",
              createdAt: nowIso()
            },
            ...prev.stashes
          ]
        }));
        setStashTitle("");
        setStashContent("");
        setStashLinksInput("");
        setStashFiles([]);
        setDuePreset("permanent");
        setDueCustomDate("");
      })
      .catch(() => {
        window.alert("文件读取失败，请重试");
      });
  }

  async function pullQqCollect(): Promise<void> {
    setQqPulling(true);
    try {
      const res = await fetch("/api/collect/qq/pull?take=50");
      if (!res.ok) {
        throw new Error("拉取QQ消息失败");
      }
      const json = (await res.json()) as {
        items: Array<{
          id: string;
          title: string;
          text: string;
          sender?: string;
          qq?: string;
          links?: string[];
          createdAt: string;
        }>;
      };
      const incoming = json.items ?? [];
      if (incoming.length === 0) {
        window.alert("暂无新的QQ消息");
        return;
      }
      updateData((prev) => ({
        ...prev,
        stashes: [
          ...incoming.map((item) => ({
            id: `stash_${item.id}`,
            title: item.title || "QQ消息",
            contentText: item.text || "",
            links: item.links ?? [],
            files: [],
            source: "qq_bot" as const,
            sourceMeta: {
              sender: item.sender || "",
              qq: item.qq || ""
            },
            dueAt: item.createdAt || nowIso(),
            status: "pending" as const,
            createdAt: item.createdAt || nowIso()
          })),
          ...prev.stashes
        ]
      }));
      setQqLastPullAt(nowIso());
      window.alert(`已拉取 ${incoming.length} 条QQ消息`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "拉取QQ消息失败");
    } finally {
      setQqPulling(false);
    }
  }

  async function sendQqTestCollect(): Promise<void> {
    setQqSending(true);
    try {
      const res = await fetch("/api/collect/qq/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(qqBotToken.trim() ? { "x-qq-token": qqBotToken.trim() } : {})
        },
        body: JSON.stringify({
          title: "QQ测试消息",
          text: `这是测试消息，时间：${formatTime(nowIso())}`,
          sender: "系统测试",
          qq: "test",
          links: []
        })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "发送测试消息失败");
      }
      await pullQqCollect();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "发送测试消息失败");
    } finally {
      setQqSending(false);
    }
  }

  async function sendQqCustomCollect(): Promise<void> {
    const text = qqDraftText.trim();
    if (!text) {
      window.alert("请先输入QQ消息内容");
      return;
    }
    setQqSending(true);
    try {
      const res = await fetch("/api/collect/qq/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(qqBotToken.trim() ? { "x-qq-token": qqBotToken.trim() } : {})
        },
        body: JSON.stringify({
          title: text.slice(0, 20),
          text,
          sender: qqDraftSender.trim() || "QQ用户",
          qq: "mock",
          links: []
        })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "发送QQ消息失败");
      }
      setQqDraftText("");
      await pullQqCollect();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "发送QQ消息失败");
    } finally {
      setQqSending(false);
    }
  }

  function setStashDraft(stashId: string, patch: Partial<{ taskId: string; action: string }>): void {
    setStashDrafts((prev) => ({
      ...prev,
      [stashId]: {
        taskId: patch.taskId ?? prev[stashId]?.taskId ?? "",
        action: patch.action ?? prev[stashId]?.action ?? ""
      }
    }));
  }

  function attachStashToTask(stashId: string): void {
    const taskId = stashDrafts[stashId]?.taskId;
    if (!taskId) {
      window.alert("请选择任务");
      return;
    }

    updateData((prev) => ({
      ...prev,
      stashes: prev.stashes.map((s) => (s.id === stashId ? { ...s, relatedTaskId: taskId } : s))
    }));
  }

  function stashToAction(stashId: string): void {
    const draft = stashDrafts[stashId];
    if (!draft?.taskId || !draft?.action.trim()) {
      window.alert("请先选择任务并填写行动内容");
      return;
    }

    addActionToTask(draft.taskId, draft.action, [], undefined, "after", { stashId });

    updateData((prev) => ({
      ...prev,
      stashes: prev.stashes.map((s) =>
        s.id === stashId ? { ...s, status: "processed", relatedTaskId: draft.taskId } : s
      )
    }));

    setStashDrafts((prev) => ({ ...prev, [stashId]: { taskId: "", action: "" } }));
  }

  function deleteStash(stashId: string): void {
    const sure = window.confirm("确定删除该暂存？");
    if (!sure) {
      return;
    }

    updateData((prev) => ({
      ...prev,
      stashes: prev.stashes.map((s) => (s.id === stashId ? { ...s, status: "deleted" } : s))
    }));
  }

  function startFutureEdit(stashId: string): void {
    const target = data.stashes.find((s) => s.id === stashId);
    if (!target) {
      return;
    }
    setFutureEditTargetId(stashId);
    setFutureEditTitle(target.title);
    setFutureEditContent(target.contentText);
  }

  function saveFutureEdit(stashId: string): void {
    const title = futureEditTitle.trim();
    const contentText = futureEditContent.trim();
    if (!title) {
      window.alert("未来可能条目的标题不能为空");
      return;
    }
    updateData((prev) => ({
      ...prev,
      stashes: prev.stashes.map((s) =>
        s.id === stashId
          ? {
              ...s,
              title,
              contentText,
              status: "future"
            }
          : s
      )
    }));
    setFutureEditTargetId(null);
    setFutureEditTitle("");
    setFutureEditContent("");
  }

  function restoreFutureStash(stashId: string): void {
    updateData((prev) => ({
      ...prev,
      stashes: prev.stashes.map((s) => (s.id === stashId ? { ...s, status: "pending" } : s))
    }));
  }

  function reuseArchive(archiveId: string): void {
    updateData((prev) => {
      const archive = prev.archives.find((a) => a.id === archiveId);
      if (!archive) {
        return prev;
      }

      const now = nowIso();
      const base = archive.taskSnapshot;
      const actionIdMap = new Map<string, string>();
      const stepIdMap = new Map<string, string>();
      const reusedSteps = (base.steps ?? []).map((s) => {
        const newStepId = uid("step");
        stepIdMap.set(s.id, newStepId);
        return {
          id: newStepId,
          name: s.name,
          createdAt: now
        };
      });
      const reusedActions = base.actions.map((a) => {
        const newId = uid("action");
        actionIdMap.set(a.id, newId);
        return {
          id: newId,
          content: a.content,
          ideaId: undefined,
          stashId: undefined,
          stepId: a.stepId ? stepIdMap.get(a.stepId) : undefined,
          note: a.note ?? "",
          noteEntries: (a.noteEntries ?? []).map((n) => ({
            id: uid("note"),
            content: n.content,
            createdAt: now
          })),
          status: "todo" as const,
          tagIds: a.tagIds.slice(0, 3),
          createdAt: now
        };
      });
      const newTask: Task = {
        id: uid("task"),
        title: `${base.title}（复用）`,
        forWhomWhy: base.forWhomWhy,
        successMetric: base.successMetric,
        obstacles: base.obstacles,
        tagIds: [],
        status: "active",
        createdAt: now,
        updatedAt: now,
        steps: reusedSteps,
        actions: reusedActions,
        materials: (base.materials ?? [])
          .filter((m) => m.type === "link")
          .filter((m) => Boolean(actionIdMap.get(m.actionId)))
          .map((m) => ({
            id: uid("material"),
            actionId: actionIdMap.get(m.actionId) ?? "",
            type: "link",
            name: m.name,
            url: m.url,
            createdAt: now
          })),
        reviews: [],
        logs: []
      };

      return {
        ...prev,
        tasks: [newTask, ...prev.tasks],
        archives: prev.archives.map((a) => (a.id === archiveId ? { ...a, reuseCount: a.reuseCount + 1 } : a))
      };
    });

    setTab("tasks");
    window.alert("已一键复用为新任务。说明：仅复制链接资料，文件资料不会复制。");
  }

  async function loadBackupList(): Promise<void> {
    const email = backupEmail.trim();
    if (!email) {
      window.alert("请先填写邮箱");
      return;
    }
    setBackupLoading(true);
    try {
      const records = await listCloudBackups(email);
      setBackupRecords(records.map((r) => ({ id: r.id, createdAt: r.createdAt, size: r.size, version: r.version })));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "获取备份列表失败");
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleCloudBackup(): Promise<void> {
    const email = backupEmail.trim();
    const pass = backupPassphrase.trim();
    if (!email || !pass) {
      window.alert("请填写邮箱和备份口令");
      return;
    }

    setBackupLoading(true);
    try {
      const encrypted = await encryptAppData(data, pass);
      await backupToCloud(email, encrypted);
      window.alert("备份成功");
      await loadBackupList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "备份失败");
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleCloudRestore(backupId: string): Promise<void> {
    const pass = backupPassphrase.trim();
    if (!pass) {
      window.alert("恢复前请填写备份口令");
      return;
    }
    const sure = window.confirm("恢复会覆盖当前本地数据，是否继续？");
    if (!sure) {
      return;
    }

    setBackupLoading(true);
    try {
      const encryptedPayload = await restoreFromCloud(backupId);
      const restored = await decryptAppData(encryptedPayload, pass);
      setData(restored);
      window.alert("恢复成功");
    } catch (err) {
      window.alert("恢复失败：请检查口令或备份内容");
    } finally {
      setBackupLoading(false);
    }
  }

  async function loadQqBotConfig(): Promise<void> {
    setQqBotConfigLoading(true);
    try {
      const res = await fetch("/api/collect/qq/config");
      if (!res.ok) {
        throw new Error("读取机器人配置失败");
      }
      const json = (await res.json()) as { token: string; fromEnv: boolean };
      setQqBotToken(json.token ?? "");
      setQqBotTokenFromEnv(Boolean(json.fromEnv));
    } catch {
      // 忽略读取失败，不影响主流程
    } finally {
      setQqBotConfigLoading(false);
    }
  }

  async function saveQqBotConfig(): Promise<void> {
    setQqBotConfigLoading(true);
    try {
      const res = await fetch("/api/collect/qq/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: qqBotToken.trim() })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "保存机器人配置失败");
      }
      window.alert("机器人配置已保存");
      await loadQqBotConfig();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "保存机器人配置失败");
    } finally {
      setQqBotConfigLoading(false);
    }
  }

  function renderCollectedFiles(
    files?: Array<{ name: string; mime: string; size: number; dataUrl: string }>
  ): JSX.Element | null {
    const list = files ?? [];
    if (list.length === 0) {
      return null;
    }
    return (
      <div className="material-box">
        {list.map((f) => (
          <div key={`${f.name}_${f.size}_${f.dataUrl.slice(0, 24)}`} className="material-item">
            <div className="material-main">
              <strong>{f.name}</strong>
              <span className="tiny">
                {f.mime || "未知类型"} | {Math.max(1, Math.round(f.size / 1024))}KB
              </span>
            </div>
            <div className="inline-actions">
              <button
                className="btn-mini btn-ghost"
                onClick={() => {
                  window.open(f.dataUrl, "_blank", "noopener,noreferrer");
                }}
              >
                打开
              </button>
              <a className="btn-mini btn-ghost" href={f.dataUrl} download={f.name}>
                下载
              </a>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${sidebarCollapsed ? "app-shell sidebar-hidden" : "app-shell"} ${darkMode ? "theme-dark" : ""}`}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <h1>防弹笔记法</h1>
        <button className={tab === "dashboard" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("dashboard")}>首页</button>
        <button className={tab === "collect" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("collect")}>收集箱</button>
        <button className={tab === "tasks" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("tasks")}>核心任务库</button>
        <button className={tab === "archives" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("archives")}>经验沉淀库</button>
        <button className={tab === "settings" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("settings")}>设置与备份</button>

        <div className="tip-box">
          <p>标签筛选</p>
          <select value={filterTagId} onChange={(e) => setFilterTagId(e.target.value)}>
            <option value="">全部任务/行动</option>
            {data.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        </div>

        <div className="tip-box">
          <p>灵感提醒时间</p>
          <input
            type="time"
            value={data.config.ideaReminderTime}
            onChange={(e) =>
              updateData((prev) => ({
                ...prev,
                config: {
                  ...prev.config,
                  ideaReminderTime: e.target.value
                }
              }))
            }
          />
        </div>

        <div className="tip-box">
          <p>行动标签（1-3）</p>
          <p className="tiny">请在任务详情 {"->"} 每条行动的“更多”中编辑标签。</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn-mini btn-ghost" onClick={() => setDarkMode((v) => !v)}>
            {darkMode ? "日间模式" : "黑夜模式"}
          </button>
          <button className="btn-mini btn-ghost" onClick={() => setSidebarCollapsed((v) => !v)}>
            {sidebarCollapsed ? "显示左栏" : "隐藏左栏"}
          </button>
          <input
            className="search-input"
            placeholder="搜索（支持多关键词，空格分隔）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>

        {query.trim() && (
          <section className="card">
            <h2>搜索结果（{results.length}）</h2>
            {results.length === 0 && <p className="muted">没有命中内容</p>}
            {results.map((r) => (
              <button key={r.id} className="search-item" onClick={() => jumpToResult(r.refId, r.module)}>
                <span>[{r.module}] {r.title}</span>
                <span>{r.snippet || "-"}</span>
                <span>{formatTime(r.createdAt)}</span>
              </button>
            ))}
          </section>
        )}

        {tab === "dashboard" && (
          <section className="grid two">
            <article className="card metric-card">
              <h2>灵感转化率</h2>
              <p className="metric">{dashboardMetrics.ideaRate}%</p>
            </article>
            <article className="card metric-card">
              <h2>任务完成率</h2>
              <p className="metric">{dashboardMetrics.taskRate}%</p>
            </article>
            <article className="card metric-card">
              <h2>经验复用次数</h2>
              <p className="metric">{dashboardMetrics.reuseCount}</p>
            </article>
            <article className="card">
              <h2>当前状态</h2>
              <p>未处理灵感：{unprocessedIdeas.length}</p>
              <p>进行中任务：{activeTasks.length}</p>
              <p>待处理收集：{pendingStashes.length}</p>
              <p>已沉淀经验：{data.archives.length}</p>
            </article>
            <article className="card span2">
              <h2>近 7 天趋势（灵感 / 任务 / 归档）</h2>
              <MiniLineChart labels={trend.labels} series={[trend.ideas, trend.tasks, trend.archives]} />
            </article>
          </section>
        )}

        {false && (
          <section className="grid two">
            <article className="card">
              <h2>新增灵感</h2>
              <input
                placeholder="灵感标题（必填，50字内）"
                value={ideaTitle}
                maxLength={50}
                onChange={(e) => setIdeaTitle(e.target.value)}
              />
              <textarea
                placeholder="灵感详情（选填，200字内）"
                value={ideaDetail}
                maxLength={200}
                onChange={(e) => setIdeaDetail(e.target.value)}
              />
              <button onClick={addIdea}>添加灵感</button>
            </article>

            <article className="card">
              <h2>灵感列表（按时间倒序）</h2>
              {data.ideas.filter((i) => i.status !== "deleted").length === 0 && <p className="muted">暂无灵感</p>}

              <div className="section-title fold-head">
                <span>待转化（{pendingIdeasList.length}）</span>
              </div>
              {pendingIdeasList.length === 0 && <p className="tiny">暂无待转化灵感</p>}
              {pendingIdeasList.map((idea) => (
                <div
                  key={idea.id}
                  className={selectedIdeaId === idea.id ? "list-item selected" : "list-item"}
                  onClick={() => setSelectedIdeaId(idea.id)}
                >
                  <div>
                    <strong>{idea.title}</strong>
                    <p className="muted">{idea.detail || "-"}</p>
                    <p className="tiny">{formatTime(idea.createdAt)}</p>
                    <div className="idea-convert-box">
                      <select
                        value={ideaActionDrafts[idea.id]?.taskId ?? ""}
                        onChange={(e) =>
                          setIdeaActionDrafts((prev) => ({
                            ...prev,
                            [idea.id]: {
                              taskId: e.target.value,
                              content: prev[idea.id]?.content ?? ""
                            }
                          }))
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">关联任务（默认当前选中任务）</option>
                        {activeTasks.map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                      <input
                        placeholder="具体行动（100字内）"
                        value={ideaActionDrafts[idea.id]?.content ?? ""}
                        maxLength={100}
                        onChange={(e) =>
                          setIdeaActionDrafts((prev) => ({
                            ...prev,
                            [idea.id]: {
                              taskId: prev[idea.id]?.taskId ?? "",
                              content: e.target.value
                            }
                          }))
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          convertIdeaToAction(idea.id);
                        }}
                      >
                        转为行动
                      </button>
                    </div>
                  </div>
                  <div className="inline-actions">
                    <span className="badge">未处理</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteIdea(idea.id); }}>删除</button>
                  </div>
                </div>
              ))}

              <div className="section-title fold-head">
                <span>已转化（{convertedIdeasList.length}）</span>
                <button onClick={() => setOpenConvertedIdeas((v) => !v)}>{openConvertedIdeas ? "收起" : "展开"}</button>
              </div>
              {openConvertedIdeas && convertedIdeasList.length === 0 && <p className="tiny">暂无已转化灵感</p>}
              {openConvertedIdeas &&
                convertedIdeasList.map((idea) => (
                  <div
                    key={idea.id}
                    className={selectedIdeaId === idea.id ? "list-item selected" : "list-item"}
                    onClick={() => setSelectedIdeaId(idea.id)}
                  >
                    <div>
                      <strong>{idea.title}</strong>
                      <p className="muted">{idea.detail || "-"}</p>
                      <p className="tiny">{formatTime(idea.createdAt)}</p>
                      <div className="converted-detail-box">
                        <p className="tiny"><strong>转化详情：</strong></p>
                        {(ideaConversionDetails[idea.id] ?? []).length === 0 && (
                          <p className="tiny">未找到转化记录（可能是历史数据）。</p>
                        )}
                        {(ideaConversionDetails[idea.id] ?? []).map((detail, idx) => (
                          <p key={`${idea.id}_${String(idx)}`} className="tiny">
                            {detail.source}｜任务：{detail.taskTitle}｜行动：{detail.actionContent}｜时间：{formatTime(detail.convertedAt)}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="inline-actions">
                      <span className="badge done">已转化</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteIdea(idea.id); }}>删除</button>
                    </div>
                  </div>
                ))}
            </article>
          </section>
        )}

        {tab === "tasks" && (
          <section className="grid">
            {filterTagId && (
              <article className="card">
                <h2>
                  标签命中行动（{selectedFilterTag?.name ?? "-"}）：{filteredActions.length}
                </h2>
                {filteredActions.length === 0 && <p className="muted">当前标签下暂无行动</p>}
                {filteredActions.map(({ task, action }) => (
                  <button
                    key={`${task.id}_${action.id}`}
                    className="search-item"
                    onClick={() => {
                      setSelectedTaskId(task.id);
                    }}
                  >
                    <span>{action.content}</span>
                    <span>任务：{task.title}</span>
                    <span>{action.status === "done" ? "已完成" : "待执行"}</span>
                  </button>
                ))}
              </article>
            )}
            <article className="card">
              <div className="inline-actions task-top-tools">
                <button onClick={() => setOpenTaskCreate((v) => !v)}>
                  {openTaskCreate ? "取消新建" : "新建任务"}
                </button>
                <select
                  value={selectedTaskId ?? ""}
                  onChange={(e) => setSelectedTaskId(e.target.value || null)}
                >
                  <option value="">选择核心任务</option>
                  {activeTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              {openTaskCreate && (
                <>
                  <input
                    placeholder="任务标题（必填，50字内）"
                    value={taskTitle}
                    maxLength={50}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <textarea
                    placeholder="为谁为何做？（100字内）"
                    value={forWhomWhy}
                    maxLength={100}
                    onChange={(e) => setForWhomWhy(e.target.value)}
                  />
                  <textarea
                    placeholder="如何量化成果？（100字内）"
                    value={successMetric}
                    maxLength={100}
                    onChange={(e) => setSuccessMetric(e.target.value)}
                  />
                  <textarea
                    placeholder="有何阻碍？（100字内）"
                    value={obstacles}
                    maxLength={100}
                    onChange={(e) => setObstacles(e.target.value)}
                  />
                  <button onClick={createTask}>确认新建</button>
                </>
              )}
              {activeTasks.length === 0 && <p className="muted">暂无可选任务</p>}
              {!selectedTask && <p className="muted">请选择任务</p>}
              {selectedTask && (
                <TaskDetail
                  task={selectedTask}
                  ideas={data.ideas}
                  stashes={data.stashes}
                  tags={data.tags}
                  highlightTagId={filterTagId || undefined}
                  materials={selectedTask.materials}
                  archiveTemplateName={archiveTemplateName}
                  archiveExperience={archiveExperience}
                  reviewEffectiveAction={reviewEffectiveAction}
                  reviewObstacle={reviewObstacle}
                  reviewAdjustment={reviewAdjustment}
                  setArchiveTemplateName={setArchiveTemplateName}
                  setArchiveExperience={setArchiveExperience}
                  setReviewEffectiveAction={setReviewEffectiveAction}
                  setReviewObstacle={setReviewObstacle}
                  setReviewAdjustment={setReviewAdjustment}
                  onUpdateField={updateTaskField}
                  onSetActionTags={updateActionTags}
                  onSetActionStep={updateActionStep}
                  onAddActionNote={addActionNote}
                  onDeleteActionNote={deleteActionNote}
                  onUpdateActionNoteEntry={updateActionNoteEntry}
                  onToggleAction={toggleAction}
                  onDeleteAction={deleteAction}
                  onReorderAction={reorderAction}
                  onMoveActionToStep={moveActionToStep}
                  onAddAction={addActionToTask}
                  onAddStep={addTaskStep}
                  onAddMaterialLink={addMaterialLink}
                  onAddMaterialText={addMaterialText}
                  onAddMaterialImage={addMaterialImage}
                  onAddMaterialFile={addMaterialFile}
                  onUpdateMaterial={updateMaterial}
                  onDeleteMaterial={deleteMaterial}
                  onReassignMaterialToAction={reassignMaterialToAction}
                  onAddReview={addReview}
                  onArchiveTask={archiveTask}
                />
              )}
            </article>
          </section>
        )}

        {tab === "archives" && (
          <section className="card">
            <h2>经验沉淀库（按归档时间倒序）</h2>
            {data.archives.length === 0 && <p className="muted">暂无归档经验</p>}
            {data.archives
              .slice()
              .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime())
              .map((a) => (
                <div key={a.id} className="archive-item">
                  <div>
                    <p><strong>{a.templateName}</strong>（原任务：{a.originTaskTitle}）</p>
                    <p>{a.coreExperience}</p>
                    <p className="tiny">归档时间：{formatTime(a.archivedAt)}</p>
                    <p className="tiny">复用次数：{a.reuseCount}</p>
                    <p className="tiny">复用规则：复制行动与链接资料，不复制文件资料。</p>
                  </div>
                  <button onClick={() => reuseArchive(a.id)}>一键复用</button>
                </div>
              ))}
          </section>
        )}

        {tab === "collect" && (
          <section className="grid two">
            <article className="card">
              <h2>手动收集</h2>
              <input
                placeholder="收集标题（选填，50字内）"
                value={stashTitle}
                maxLength={50}
                onChange={(e) => setStashTitle(e.target.value)}
              />
              <textarea
                placeholder="一段话 / 思路 / 代码（可直接粘贴）"
                value={stashContent}
                onChange={(e) => setStashContent(e.target.value)}
              />
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files ?? []);
                  if (files.length === 0) {
                    return;
                  }
                  setStashFiles((prev) => [...prev, ...files].slice(0, 10));
                }}
              >
                <p className="tiny">拖拽文件到此（支持图片、Word等，最多10个）</p>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) {
                      return;
                    }
                    setStashFiles((prev) => [...prev, ...files].slice(0, 10));
                    e.currentTarget.value = "";
                  }}
                />
                {stashFiles.length > 0 && (
                  <p className="tiny">
                    已选文件：{stashFiles.map((f) => f.name).join("、")}
                  </p>
                )}
              </div>
              <textarea
                placeholder="链接（多个可用空格/换行分隔）"
                value={stashLinksInput}
                onChange={(e) => setStashLinksInput(e.target.value)}
              />
              <div className="inline-actions">
                <select value={duePreset} onChange={(e) => setDuePreset(e.target.value as DuePreset)}>
                  <option value="permanent">永久（默认）</option>
                  <option value="1">1 天</option>
                  <option value="3">3 天</option>
                  <option value="7">7 天</option>
                  <option value="custom">自定义日期</option>
                </select>
                {duePreset === "custom" && (
                  <input type="date" value={dueCustomDate} onChange={(e) => setDueCustomDate(e.target.value)} />
                )}
              </div>
              <button onClick={addStash}>添加到收集箱</button>
            </article>

            <article className="card span2">
              <h2>收集内容</h2>
              <div className="section-title fold-head">
                <span>待处理（{pendingStashes.length}）</span>
              </div>
              {pendingStashes.length === 0 && <p className="muted">暂无待处理收集</p>}
              {pendingStashes.map((s) => {
                const d = stashDrafts[s.id] ?? { taskId: "", action: "" };
                return (
                  <div key={s.id} className="archive-item">
                    <div>
                      <p>
                        <strong>{s.title}</strong>{" "}
                        <span className={s.source === "qq_bot" ? "badge source-qq" : "badge source-manual"}>
                          {s.source === "qq_bot" ? "QQ机器人" : "手动收集"}
                        </span>
                      </p>
                      <p>{s.contentText || "-"}</p>
                      {s.source === "qq_bot" && (s.sourceMeta?.sender || s.sourceMeta?.qq) && (
                        <p className="tiny">
                          发送者：{s.sourceMeta?.sender || "-"} {s.sourceMeta?.qq ? `(${s.sourceMeta.qq})` : ""}
                        </p>
                      )}
                      {renderCollectedFiles(s.files)}
                      <p className="tiny">到期：{isPermanentDue(s.dueAt) ? "永久" : formatTime(s.dueAt)}</p>
                      {s.relatedTaskId && <p className="tiny">已关联任务：{activeTasks.find((t) => t.id === s.relatedTaskId)?.title ?? s.relatedTaskId}</p>}
                    </div>
                    <div className="stash-actions">
                      <select value={d.taskId} onChange={(e) => setStashDraft(s.id, { taskId: e.target.value })}>
                        <option value="">选择任务</option>
                        {activeTasks.map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                      <input
                        placeholder="转化行动内容"
                        value={d.action}
                        maxLength={100}
                        onChange={(e) => setStashDraft(s.id, { action: e.target.value })}
                      />
                      <button className="btn-mini" onClick={() => stashToAction(s.id)}>转化为任务行动</button>
                      <button className="btn-mini btn-ghost" onClick={() => startFutureEdit(s.id)}>未来可能</button>
                      <button className="btn-mini btn-ghost" onClick={() => attachStashToTask(s.id)}>关联到现有任务</button>
                      <button className="btn-mini btn-ghost" onClick={() => deleteStash(s.id)}>删除</button>
                    </div>
                    {futureEditTargetId === s.id && (
                      <div className="future-edit-box">
                        <input
                          placeholder="未来可能标题"
                          value={futureEditTitle}
                          maxLength={50}
                          onChange={(e) => setFutureEditTitle(e.target.value)}
                        />
                        <textarea
                          placeholder="未来可能说明（建议补充上下文，避免未来看不懂）"
                          value={futureEditContent}
                          onChange={(e) => setFutureEditContent(e.target.value)}
                        />
                        <div className="inline-actions">
                          <button onClick={() => saveFutureEdit(s.id)}>保存到未来可能</button>
                          <button
                            className="btn-ghost"
                            onClick={() => {
                              setFutureEditTargetId(null);
                              setFutureEditTitle("");
                              setFutureEditContent("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="section-title fold-head">
                <span>已转化（{processedStashes.length}）</span>
                <button onClick={() => setOpenProcessedCollect((v) => !v)}>
                  {openProcessedCollect ? "收起" : "展开"}
                </button>
              </div>
              {openProcessedCollect && processedStashes.length === 0 && <p className="tiny">暂无已转化收集</p>}
              {openProcessedCollect &&
                processedStashes.map((s) => (
                  <div key={s.id} className="archive-item">
                    <div>
                      <p>
                        <strong>{s.title}</strong>{" "}
                        <span className={s.source === "qq_bot" ? "badge source-qq" : "badge source-manual"}>
                          {s.source === "qq_bot" ? "QQ机器人" : "手动收集"}
                        </span>
                        <span className="badge done">已转化</span>
                      </p>
                      <p>{s.contentText || "-"}</p>
                      {renderCollectedFiles(s.files)}
                      <p className="tiny">创建时间：{formatTime(s.createdAt)}</p>
                      {s.relatedTaskId && (
                        <p className="tiny">
                          已关联任务：{activeTasks.find((t) => t.id === s.relatedTaskId)?.title ?? s.relatedTaskId}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

              <div className="section-title fold-head">
                <span>未来可能（{futureStashes.length}）</span>
                <button onClick={() => setOpenFutureCollect((v) => !v)}>
                  {openFutureCollect ? "收起" : "展开"}
                </button>
              </div>
              {openFutureCollect && futureStashes.length === 0 && <p className="tiny">暂无未来可能</p>}
              {openFutureCollect &&
                futureStashes.map((s) => (
                  <div key={s.id} className="archive-item">
                    <div>
                      <p>
                        <strong>{s.title}</strong>{" "}
                        <span className={s.source === "qq_bot" ? "badge source-qq" : "badge source-manual"}>
                          {s.source === "qq_bot" ? "QQ机器人" : "手动收集"}
                        </span>
                        <span className="badge">未来可能</span>
                      </p>
                      <p>{s.contentText || "-"}</p>
                      {renderCollectedFiles(s.files)}
                      <p className="tiny">创建时间：{formatTime(s.createdAt)}</p>
                    </div>
                    <div className="stash-actions">
                      <button onClick={() => restoreFutureStash(s.id)}>转回待处理</button>
                      <button onClick={() => deleteStash(s.id)}>删除</button>
                    </div>
                  </div>
                ))}
            </article>
          </section>
        )}

        {tab === "settings" && (
          <section className="grid two">
            <article className="card">
              <h2>机器人配置</h2>
              <input
                placeholder="QQ 机器人 Token（用于校验）"
                value={qqBotToken}
                disabled={qqBotTokenFromEnv}
                onChange={(e) => setQqBotToken(e.target.value)}
              />
              <div className="inline-actions">
                <button disabled={qqBotConfigLoading || qqBotTokenFromEnv} onClick={() => void saveQqBotConfig()}>
                  保存机器人配置
                </button>
                <button disabled={qqBotConfigLoading} className="btn-ghost" onClick={() => void loadQqBotConfig()}>
                  刷新
                </button>
              </div>
              <p className="tiny">推送接口：`POST /api/collect/qq/message`</p>
              <p className="tiny">请求头：`x-qq-token: 你配置的Token`</p>
              {qqBotTokenFromEnv && <p className="tiny">当前Token由服务端环境变量锁定（QQ_WEBHOOK_TOKEN）。</p>}
            </article>

            <article className="card">
              <h2>标签管理</h2>
              <div className="inline-actions">
                <input
                  placeholder="新增自定义标签（最多10个）"
                  value={customTagName}
                  onChange={(e) => setCustomTagName(e.target.value)}
                />
                <button onClick={addCustomTag}>新增标签</button>
              </div>
              <div className="chips">
                {data.tags.map((tag) => (
                  <span key={tag.id} className="chip">
                    {tag.name}
                    {!tag.system && <button onClick={() => removeCustomTag(tag)}>x</button>}
                  </span>
                ))}
              </div>
            </article>

            <article className="card">
              <h2>云端备份</h2>
              <input
                placeholder="绑定邮箱"
                value={backupEmail}
                onChange={(e) => setBackupEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="备份口令（用于加密/解密）"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
              />
              <div className="inline-actions">
                <button disabled={backupLoading} onClick={handleCloudBackup}>立即备份</button>
                <button disabled={backupLoading} onClick={loadBackupList}>刷新备份列表</button>
              </div>
              <p className="tiny">系统会仅保留该邮箱最近 10 次备份。</p>
            </article>

            <article className="card">
              <h2>恢复备份</h2>
              {backupRecords.length === 0 && <p className="muted">暂无备份记录，请先刷新列表</p>}
              {backupRecords.map((item) => (
                <div key={item.id} className="list-item">
                  <div>
                    <p className="tiny">ID: {item.id}</p>
                    <p className="tiny">时间: {formatTime(item.createdAt)}</p>
                    <p className="tiny">大小: {item.size} bytes</p>
                  </div>
                  <button disabled={backupLoading} onClick={() => handleCloudRestore(item.id)}>恢复此备份</button>
                </div>
              ))}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function TaskDetail(props: {
  task: Task;
  ideas: Idea[];
  stashes: AppData["stashes"];
  tags: Tag[];
  highlightTagId?: string;
  materials: Material[];
  archiveTemplateName: string;
  archiveExperience: string;
  reviewEffectiveAction: string;
  reviewObstacle: string;
  reviewAdjustment: string;
  setArchiveTemplateName: (v: string) => void;
  setArchiveExperience: (v: string) => void;
  setReviewEffectiveAction: (v: string) => void;
  setReviewObstacle: (v: string) => void;
  setReviewAdjustment: (v: string) => void;
  onUpdateField: (taskId: string, field: "title" | "forWhomWhy" | "successMetric" | "obstacles", value: string) => void;
  onSetActionTags: (taskId: string, actionId: string, tagIds: string[]) => void;
  onSetActionStep: (taskId: string, actionId: string, stepId: string) => void;
  onAddActionNote: (taskId: string, actionId: string, note: string) => void;
  onDeleteActionNote: (taskId: string, actionId: string, noteId: string) => void;
  onUpdateActionNoteEntry: (taskId: string, actionId: string, noteId: string, content: string) => void;
  onAddAction: (
    taskId: string,
    content: string,
    tagIds: string[],
    anchorActionId?: string,
    position?: "before" | "after",
    source?: { ideaId?: string; stashId?: string },
    stepId?: string
  ) => void;
  onAddStep: (taskId: string, name: string) => void;
  onReorderAction: (taskId: string, draggedActionId: string, targetActionId: string) => void;
  onMoveActionToStep: (taskId: string, draggedActionId: string, stepId?: string) => void;
  onAddMaterialLink: (taskId: string, actionId: string, name: string, url: string) => void;
  onAddMaterialText: (taskId: string, actionId: string, name: string, content: string, type: "text" | "code") => void;
  onAddMaterialImage: (taskId: string, actionId: string, name: string, url: string) => void;
  onAddMaterialFile: (taskId: string, actionId: string, file: File) => void;
  onUpdateMaterial: (taskId: string, materialId: string, patch: Partial<Pick<Material, "name" | "url" | "content">>) => void;
  onDeleteMaterial: (taskId: string, materialId: string) => void;
  onReassignMaterialToAction: (taskId: string, materialId: string, targetActionId: string) => void;
  onToggleAction: (taskId: string, actionId: string) => void;
  onDeleteAction: (taskId: string, actionId: string) => void;
  onAddReview: (task: Task) => void;
  onArchiveTask: (task: Task) => void;
}) {
  const { task } = props;
  const [newAction, setNewAction] = useState("");
  const [newActionStepId, setNewActionStepId] = useState("");
  const [newActionTagIds, setNewActionTagIds] = useState<string[]>([]);
  const [newStepName, setNewStepName] = useState("");
  const [openAddStepInput, setOpenAddStepInput] = useState(false);
  const [stepQuickActionDrafts, setStepQuickActionDrafts] = useState<Record<string, string>>({});
  const [actionNoteDrafts, setActionNoteDrafts] = useState<Record<string, string>>({});
  const [materialNameDrafts, setMaterialNameDrafts] = useState<Record<string, string>>({});
  const [renamingMaterialId, setRenamingMaterialId] = useState<string | null>(null);
  const [openCoreQuestions, setOpenCoreQuestions] = useState(false);
  const [openActionAdvanced, setOpenActionAdvanced] = useState<Record<string, boolean>>({});
  const [openNewActionTags, setOpenNewActionTags] = useState(false);
  const [insertTarget, setInsertTarget] = useState<{ actionId: string; position: "before" | "after" } | null>(null);
  const [insertAction, setInsertAction] = useState("");
  const [insertActionTagIds, setInsertActionTagIds] = useState<string[]>([]);
  const [openInsertTags, setOpenInsertTags] = useState(false);
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [draggedActionId, setDraggedActionId] = useState<string | null>(null);
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null);
  const [dropTargetActionId, setDropTargetActionId] = useState<string | null>(null);
  const [draggedOutlineActionId, setDraggedOutlineActionId] = useState<string | null>(null);
  const [outlineDropTargetActionId, setOutlineDropTargetActionId] = useState<string | null>(null);
  const [outlineDropTargetStepId, setOutlineDropTargetStepId] = useState<string | null>(null);
  const [openStepGroups, setOpenStepGroups] = useState<Record<string, boolean>>({});
  const [actionFocusMode, setActionFocusMode] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedNoteByAction, setSelectedNoteByAction] = useState<Record<string, string | null>>({});
  const [selectedMaterialByAction, setSelectedMaterialByAction] = useState<Record<string, string | null>>({});
  const [editingNoteByAction, setEditingNoteByAction] = useState<Record<string, string | null>>({});
  const [editingNoteDraftByAction, setEditingNoteDraftByAction] = useState<Record<string, string>>({});
  const siyuanMode = true;
  const [openSections, setOpenSections] = useState({
    actions: true,
    review: false,
    archive: false
  });

  function toggleSection(key: "actions" | "review" | "archive"): void {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleActionAdvanced(actionId: string): void {
    setOpenActionAdvanced((prev) => ({ ...prev, [actionId]: !prev[actionId] }));
  }

  async function openMaterialPreview(material: Material): Promise<void> {
    if (material.type === "link" && material.url) {
      window.open(material.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (material.type === "image" && material.url) {
      setPreviewMaterial(material);
      setPreviewText("");
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }
    if (material.type === "text" || material.type === "code") {
      setPreviewMaterial(material);
      setPreviewText(material.content ?? "");
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }
    if (material.type !== "file" || !material.fileMeta) {
      return;
    }
    setPreviewMaterial(material);
    setPreviewText("");
    setPreviewError("");
    const mime = material.fileMeta.mime.toLowerCase();
    const isText =
      mime.startsWith("text/") ||
      mime.includes("json") ||
      mime.includes("xml") ||
      mime.includes("javascript") ||
      /\.(txt|md|csv|json|log)$/i.test(material.name);
    if (!isText) {
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(material.fileMeta.dataUrl);
      const text = await res.text();
      setPreviewText(text);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "文本预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  const stepMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of task.steps) {
      map.set(s.id, s.name);
    }
    return map;
  }, [task.steps]);

  const groupedActions = useMemo(() => {
    const groups: Array<{ id: string; name: string; actions: TaskAction[]; isVirtual?: boolean }> = task.steps.map((s) => ({
      id: s.id,
      name: s.name,
      actions: task.actions.filter((a) => a.stepId === s.id)
    }));
    const ungrouped = task.actions.filter((a) => !a.stepId || !stepMap.has(a.stepId));
    if (ungrouped.length > 0) {
      groups.push({
        id: "__ungrouped__",
        name: "未分组步骤",
        actions: ungrouped,
        isVirtual: true
      });
    }
    if (groups.length === 0) {
      groups.push({
        id: "__ungrouped__",
        name: "未分组步骤",
        actions: [],
        isVirtual: true
      });
    }
    return groups;
  }, [task.steps, task.actions, stepMap]);

  useEffect(() => {
    if (task.actions.length === 0) {
      setSelectedActionId(null);
      return;
    }
    if (!selectedActionId || !task.actions.some((a) => a.id === selectedActionId)) {
      setSelectedActionId(task.actions[0].id);
    }
  }, [task.actions, selectedActionId]);

  function toggleStepGroup(stepId: string): void {
    setOpenStepGroups((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  }

  function renderActionCard(action: TaskAction): JSX.Element {
    const sourceIdea = props.ideas.find((i) => i.id === action.ideaId);
    const sourceCollect = props.stashes.find((s) => s.id === action.stashId);
    const sourceText = sourceIdea?.title ?? sourceCollect?.title ?? "-";
    const actionMaterials = props.materials.filter((m) => m.actionId === action.id);
    const actionNotes = action.noteEntries ?? [];
    const advancedOpen = true;
    const isHighlighted = Boolean(props.highlightTagId && action.tagIds.includes(props.highlightTagId));
    return (
      <div
        key={action.id}
        className={`${dropTargetActionId === action.id ? "action-item drop-target" : "action-item"} no-grab ${actionFocusMode ? "focus" : ""} ${isHighlighted ? "action-item highlighted" : ""}`}
        draggable={false}
        onDoubleClick={() => {
          if (actionFocusMode) {
            return;
          }
          toggleActionAdvanced(action.id);
        }}
        onDragStart={(e) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          setDraggedActionId(action.id);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDropTargetActionId(action.id);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
            return;
          }
          setDropTargetActionId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const droppedFiles = Array.from(e.dataTransfer.files ?? []);
          if (droppedFiles.length > 0) {
            droppedFiles.forEach((file) => props.onAddMaterialFile(task.id, action.id, file));
            setDraggedActionId(null);
            setDraggedMaterialId(null);
            setDropTargetActionId(null);
            return;
          }
          if (draggedMaterialId) {
            props.onReassignMaterialToAction(task.id, draggedMaterialId, action.id);
          } else if (draggedActionId) {
            props.onReorderAction(task.id, draggedActionId, action.id);
          }
          setDraggedActionId(null);
          setDraggedMaterialId(null);
          setDropTargetActionId(null);
        }}
        onDragEnd={() => {
          setDraggedActionId(null);
          setDraggedMaterialId(null);
          setDropTargetActionId(null);
        }}
      >
        <div>
          <p className={action.status === "done" ? "done-text" : ""}>{action.content}</p>
          {!actionFocusMode && advancedOpen && (
            <div className="action-advanced">
              <p className="tiny">创建时间：{formatTime(action.createdAt)}</p>
              <p className="tiny">关联灵感：{sourceText}</p>
              <div className="material-box">
                <p className="tiny">行动笔记</p>
                <textarea
                  placeholder="在这里写行动思考、文本或代码（每次保存会累计）"
                  value={actionNoteDrafts[action.id] ?? ""}
                  maxLength={2000}
                  onChange={(e) =>
                    setActionNoteDrafts((prev) => ({
                      ...prev,
                      [action.id]: e.target.value
                    }))
                  }
                />
                <p className="tiny">一个输入框统一记录思考、文本和代码。</p>
                <div className="inline-actions">
                  <button
                    className="btn-mini"
                    onClick={() => {
                      const noteDraft = (actionNoteDrafts[action.id] ?? "").trim();

                      if (!noteDraft) {
                        window.alert("请先填写内容");
                        return;
                      }

                      props.onAddActionNote(task.id, action.id, noteDraft);
                      setActionNoteDrafts((prev) => ({ ...prev, [action.id]: "" }));

                    }}
                  >
                    保存
                  </button>
                </div>
                {actionNotes.length > 0 && (
                  <div className="inline-actions col">
                    {actionNotes.map((n) => (
                      <div
                        key={n.id}
                        className={`material-item note-item ${selectedNoteByAction[action.id] === n.id ? "selected" : ""}`}
                        onClick={() =>
                          setSelectedNoteByAction((prev) => ({
                            ...prev,
                            [action.id]: n.id
                          }))
                        }
                        onDoubleClick={() => {
                          setSelectedNoteByAction((prev) => ({
                            ...prev,
                            [action.id]: n.id
                          }));
                          setEditingNoteByAction((prev) => ({
                            ...prev,
                            [action.id]: n.id
                          }));
                          setEditingNoteDraftByAction((prev) => ({
                            ...prev,
                            [action.id]: n.content
                          }));
                        }}
                      >
                        <div className="note-head">
                          <p className="tiny">{formatTime(n.createdAt)}</p>
                          {selectedNoteByAction[action.id] === n.id && editingNoteByAction[action.id] !== n.id && (
                            <button
                              className="btn-mini btn-ghost note-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onDeleteActionNote(task.id, action.id, n.id);
                              }}
                            >
                              删除
                            </button>
                          )}
                        </div>
                        {editingNoteByAction[action.id] === n.id ? (
                          <div className="inline-actions col">
                            <textarea
                              value={editingNoteDraftByAction[action.id] ?? ""}
                              maxLength={2000}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setEditingNoteDraftByAction((prev) => ({
                                  ...prev,
                                  [action.id]: e.target.value
                                }))
                              }
                            />
                            <div className="inline-actions">
                              <button
                                className="btn-mini"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onUpdateActionNoteEntry(task.id, action.id, n.id, editingNoteDraftByAction[action.id] ?? "");
                                  setEditingNoteByAction((prev) => ({
                                    ...prev,
                                    [action.id]: null
                                  }));
                                }}
                              >
                                保存
                              </button>
                              <button
                                className="btn-mini btn-ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNoteByAction((prev) => ({
                                    ...prev,
                                    [action.id]: null
                                  }));
                                  setEditingNoteDraftByAction((prev) => ({
                                    ...prev,
                                    [action.id]: n.content
                                  }));
                                }}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <pre className="preview-text">{n.content}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className="drop-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedFiles = Array.from(e.dataTransfer.files ?? []);
                    droppedFiles.forEach((file) => props.onAddMaterialFile(task.id, action.id, file));
                  }}
                >
                  <p className="tiny">拖拽图片/文件到这里，自动保存到当前行动。</p>
                </div>
                {actionMaterials.length > 0 && (
                  <div className="inline-actions col">
                    {actionMaterials.map((m) => (
                      <div
                        key={m.id}
                        className={`material-item ${selectedMaterialByAction[action.id] === m.id ? "selected" : ""}`}
                        draggable
                        onClick={() =>
                          setSelectedMaterialByAction((prev) => ({
                            ...prev,
                            [action.id]: m.id
                          }))
                        }
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDraggedMaterialId(m.id);
                        }}
                      >
                        <div className="material-main">
                          {m.type === "file" ? (
                            renamingMaterialId === m.id ? (
                              <div className="inline-actions">
                                <input
                                  autoFocus
                                  placeholder="标记名（仅系统内显示）"
                                  value={materialNameDrafts[m.id] ?? m.name}
                                  maxLength={80}
                                  onChange={(e) =>
                                    setMaterialNameDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter") {
                                      return;
                                    }
                                    const nextName = (materialNameDrafts[m.id] ?? m.name).trim();
                                    if (!nextName) {
                                      return;
                                    }
                                    props.onUpdateMaterial(task.id, m.id, { name: nextName });
                                    setRenamingMaterialId(null);
                                  }}
                                />
                                <button
                                  className="btn-mini btn-ghost"
                                  onClick={() => {
                                    const nextName = (materialNameDrafts[m.id] ?? m.name).trim();
                                    if (!nextName) {
                                      return;
                                    }
                                    props.onUpdateMaterial(task.id, m.id, { name: nextName });
                                    setRenamingMaterialId(null);
                                  }}
                                >
                                  保存
                                </button>
                                <button
                                  className="btn-mini btn-ghost"
                                  onClick={() => {
                                    setMaterialNameDrafts((prev) => ({ ...prev, [m.id]: m.name }));
                                    setRenamingMaterialId(null);
                                  }}
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn-mini btn-ghost"
                                onClick={() => {
                                  setMaterialNameDrafts((prev) => ({ ...prev, [m.id]: m.name }));
                                  setRenamingMaterialId(m.id);
                                }}
                              >
                                {m.name}
                              </button>
                            )
                          ) : (
                            <button className="btn-mini btn-ghost" onClick={() => void openMaterialPreview(m)}>
                              打开：{m.name}
                            </button>
                          )}
                          <span className="tiny">
                            {m.type === "file"
                              ? "文件"
                              : m.type === "link"
                                ? "链接"
                                : m.type === "image"
                                  ? "图片"
                                  : m.type === "code"
                                    ? "代码"
                                    : "文字"}{" "}
                            | {formatTime(m.createdAt)}
                          </span>
                        </div>
                        <div className="inline-actions">
                          {m.type === "file" && (
                            <button className="btn-mini btn-ghost" onClick={() => void openMaterialPreview(m)}>
                              打开
                            </button>
                          )}
                          {selectedMaterialByAction[action.id] === m.id && (
                            <button className="btn-mini btn-ghost" onClick={() => props.onDeleteMaterial(task.id, m.id)}>
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="material-collapsed-head">
                <span className="tiny">标签编辑</span>
                <span className="tiny">已展开</span>
              </div>
              <TagSelector
                tags={props.tags}
                selected={action.tagIds}
                onChange={(ids) => props.onSetActionTags(task.id, action.id, ids)}
              />
              <div className="action-delete-line">
                <button
                  className="btn-mini btn-ghost"
                  onClick={() => {
                    setInsertTarget({ actionId: action.id, position: "before" });
                    setInsertAction("");
                    setInsertActionTagIds([]);
                    setOpenInsertTags(false);
                  }}
                >
                  在前面添加
                </button>
                <button
                  className="btn-mini btn-ghost"
                  onClick={() => {
                    setInsertTarget({ actionId: action.id, position: "after" });
                    setInsertAction("");
                    setInsertActionTagIds([]);
                    setOpenInsertTags(false);
                  }}
                >
                  在后面添加
                </button>
                <button className="btn-mini btn-ghost" onClick={() => props.onDeleteAction(task.id, action.id)}>删除该行动</button>
              </div>
            </div>
          )}
          {insertTarget?.actionId === action.id && (
            <div className="inline-insert-box">
              <p className="tiny">
                {insertTarget.position === "before" ? "在当前行动前插入新行动" : "在当前行动后插入新行动"}
              </p>
              <input
                placeholder="新行动内容（100字内）"
                value={insertAction}
                maxLength={100}
                onChange={(e) => setInsertAction(e.target.value)}
              />
              <div className="material-collapsed-head">
                <span className="tiny">标签：{insertActionTagIds.length} 个已选</span>
                <button className="btn-mini btn-ghost" onClick={() => setOpenInsertTags((v) => !v)}>
                  {openInsertTags ? "收起标签" : "添加标签(可选)"}
                </button>
              </div>
              {openInsertTags && (
                <TagSelector tags={props.tags} selected={insertActionTagIds} onChange={setInsertActionTagIds} />
              )}
              <div className="inline-actions">
                <button
                  className="btn-mini"
                  onClick={() => {
                    props.onAddAction(task.id, insertAction, insertActionTagIds, action.id, insertTarget.position);
                    setInsertTarget(null);
                    setInsertAction("");
                    setInsertActionTagIds([]);
                    setOpenInsertTags(false);
                  }}
                >
                  确认插入
                </button>
                <button
                  className="btn-mini btn-ghost"
                  onClick={() => {
                    setInsertTarget(null);
                    setInsertAction("");
                    setInsertActionTagIds([]);
                    setOpenInsertTags(false);
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="action-side-tools">
          <button className="btn-mini" onClick={() => props.onToggleAction(task.id, action.id)}>
            {action.status === "done" ? "取消完成" : "标记完成"}
          </button>
          {!actionFocusMode && <span className="tiny">双击卡片{advancedOpen ? "收起" : "展开"}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="task-detail">
      <div className="inline-actions">
        <button className="btn-mini btn-ghost" onClick={() => setOpenCoreQuestions((v) => !v)}>
          {openCoreQuestions ? "收起核心三问" : "显示核心三问"}
        </button>
      </div>
      <div className="section-inline-row">
        <div className="section-title fold-head">
          <span className="tiny">行动</span>
        </div>
      </div>
      {openCoreQuestions && (
        <div className="core-compact-stack material-box">
          <label>
            <span className="tiny">为谁为何做</span>
            <textarea
              className="compact-textarea"
              value={task.forWhomWhy}
              maxLength={100}
              onChange={(e) => props.onUpdateField(task.id, "forWhomWhy", e.target.value)}
            />
          </label>
          <label>
            <span className="tiny">如何量化成果</span>
            <textarea
              className="compact-textarea"
              value={task.successMetric}
              maxLength={100}
              onChange={(e) => props.onUpdateField(task.id, "successMetric", e.target.value)}
            />
          </label>
          <label>
            <span className="tiny">有何阻碍</span>
            <textarea
              className="compact-textarea"
              value={task.obstacles}
              maxLength={100}
              onChange={(e) => props.onUpdateField(task.id, "obstacles", e.target.value)}
            />
          </label>
        </div>
      )}

      {false && (
        <div className="material-box">
          <p className="tiny">步骤总览（收起状态）</p>
          {groupedActions.length === 0 && <p className="tiny">暂无步骤</p>}
          {groupedActions.map((group) => (
            <p key={group.id} className="tiny">
              {group.name}（{group.actions.length}）
            </p>
          ))}
        </div>
      )}

      {(
        <>
          {siyuanMode ? (
            <div className="siyuan-workbench">
              <aside className="siyuan-outline">
                {!openAddStepInput ? (
                  <button className="btn-mini btn-ghost" onClick={() => setOpenAddStepInput(true)}>
                    添加步骤
                  </button>
                ) : (
                  <div className="inline-actions col">
                    <input
                      placeholder="新增步骤（如：调研 / 执行 / 复盘）"
                      value={newStepName}
                      maxLength={30}
                      onChange={(e) => setNewStepName(e.target.value)}
                    />
                    <div className="inline-actions">
                      <button
                        className="btn-mini"
                        onClick={() => {
                          props.onAddStep(task.id, newStepName);
                          setNewStepName("");
                          setOpenAddStepInput(false);
                        }}
                      >
                        保存
                      </button>
                      <button
                        className="btn-mini btn-ghost"
                        onClick={() => {
                          setNewStepName("");
                          setOpenAddStepInput(false);
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {groupedActions.map((group) => (
                  <div
                    key={group.id}
                    className={`siyuan-step ${outlineDropTargetStepId === group.id ? "drop-target" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setOutlineDropTargetStepId(group.id);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        return;
                      }
                      setOutlineDropTargetStepId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedOutlineActionId) {
                        props.onMoveActionToStep(task.id, draggedOutlineActionId, group.isVirtual ? undefined : group.id);
                      }
                      setDraggedOutlineActionId(null);
                      setOutlineDropTargetActionId(null);
                      setOutlineDropTargetStepId(null);
                    }}
                  >
                    <p className="tiny">
                      {group.name}（{group.actions.length}）
                    </p>
                    {group.actions.length === 0 && <p className="tiny">暂无行动</p>}
                    {group.actions.map((action) => (
                      <button
                        key={action.id}
                        className={`${selectedActionId === action.id ? "siyuan-action active" : "siyuan-action"} ${outlineDropTargetActionId === action.id ? "drop-target" : ""}`}
                        draggable
                        onDragStart={() => {
                          setDraggedOutlineActionId(action.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setOutlineDropTargetActionId(action.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedOutlineActionId && draggedOutlineActionId !== action.id) {
                            props.onReorderAction(task.id, draggedOutlineActionId, action.id);
                          }
                          setDraggedOutlineActionId(null);
                          setOutlineDropTargetActionId(null);
                          setOutlineDropTargetStepId(null);
                        }}
                        onDragEnd={() => {
                          setDraggedOutlineActionId(null);
                          setOutlineDropTargetActionId(null);
                          setOutlineDropTargetStepId(null);
                        }}
                        onClick={() => setSelectedActionId(action.id)}
                      >
                        {action.status === "done" ? "✓ " : ""}
                        {action.content}
                      </button>
                    ))}
                  </div>
                ))}
              </aside>
              <section className="siyuan-editor">
                {!selectedActionId && <p className="muted">请先选择一个行动</p>}
                {selectedActionId &&
                  task.actions
                    .filter((a) => a.id === selectedActionId)
                    .map((action) => renderActionCard(action))}
              </section>
            </div>
          ) : (
            <>
          <div className="focus-mode-toggle">
            <button className="btn-mini btn-ghost" onClick={() => setActionFocusMode((v) => !v)}>
              {actionFocusMode ? "退出专注模式" : "进入专注模式"}
            </button>
          </div>
          {!actionFocusMode && (
            <>
              <div className="inline-actions">
                <input
                  placeholder="新增步骤（如：调研 / 执行 / 复盘）"
                  value={newStepName}
                  maxLength={30}
                  onChange={(e) => setNewStepName(e.target.value)}
                />
                <button
                  className="btn-mini"
                  onClick={() => {
                    props.onAddStep(task.id, newStepName);
                    setNewStepName("");
                  }}
                >
                  添加步骤
                </button>
              </div>
              <p className="tiny">可拖拽行动卡片调整先后顺序（从上到下即执行顺序）。</p>
              <div className="inline-actions col">
                <input
                  placeholder="新增行动（100字内）"
                  value={newAction}
                  maxLength={100}
                  onChange={(e) => setNewAction(e.target.value)}
                />
                <select value={newActionStepId} onChange={(e) => setNewActionStepId(e.target.value)}>
                  <option value="">未分组步骤</option>
                  {task.steps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="material-collapsed-head">
                  <span className="tiny">标签：{newActionTagIds.length} 个已选</span>
                  <button onClick={() => setOpenNewActionTags((v) => !v)}>
                    {openNewActionTags ? "收起标签" : "添加标签(可选)"}
                  </button>
                </div>
                {openNewActionTags && (
                  <TagSelector tags={props.tags} selected={newActionTagIds} onChange={setNewActionTagIds} />
                )}
                <button
                  onClick={() => {
                    props.onAddAction(task.id, newAction, newActionTagIds, undefined, "after", undefined, newActionStepId || undefined);
                    setNewAction("");
                    setNewActionStepId("");
                    setNewActionTagIds([]);
                    setOpenNewActionTags(false);
                  }}
                >
                  添加行动
                </button>
              </div>
            </>
          )}

          {task.actions.length === 0 && <p className="muted">暂无行动</p>}
          {groupedActions.map((group) => {
            const isOpen = openStepGroups[group.id] ?? true;
            return (
              <div key={group.id} className="step-group">
                <div className="section-title fold-head">
                  <span>步骤：{group.name}（{group.actions.length}）</span>
                  <button className="btn-mini btn-ghost" onClick={() => toggleStepGroup(group.id)}>
                    {isOpen ? "收起" : "展开"}
                  </button>
                </div>
                {isOpen && !actionFocusMode && (
                  <div className="inline-actions">
                    <input
                      placeholder={`在“${group.name}”里新增小行动`}
                      value={stepQuickActionDrafts[group.id] ?? ""}
                      maxLength={100}
                      onChange={(e) =>
                        setStepQuickActionDrafts((prev) => ({
                          ...prev,
                          [group.id]: e.target.value
                        }))
                      }
                    />
                    <button
                      className="btn-mini"
                      onClick={() => {
                        props.onAddAction(
                          task.id,
                          stepQuickActionDrafts[group.id] ?? "",
                          [],
                          undefined,
                          "after",
                          undefined,
                          group.isVirtual ? undefined : group.id
                        );
                        setStepQuickActionDrafts((prev) => ({ ...prev, [group.id]: "" }));
                      }}
                    >
                      添加小行动
                    </button>
                  </div>
                )}
                {isOpen && group.actions.length === 0 && <p className="tiny">该步骤下暂无小行动</p>}
                {isOpen && group.actions.map((action) => renderActionCard(action))}
              </div>
            );
          })}
            </>
          )}
        </>
      )}

      <div className="section-title fold-head">
        <span>覆盘</span>
        <button onClick={() => toggleSection("review")}>{openSections.review ? "收起新增" : "新增覆盘"}</button>
      </div>
      {openSections.review && (
        <>
          <input
            placeholder="有效行动（100字内）"
            value={props.reviewEffectiveAction}
            maxLength={100}
            onChange={(e) => props.setReviewEffectiveAction(e.target.value)}
          />
          <input
            placeholder="实际阻碍（100字内）"
            value={props.reviewObstacle}
            maxLength={100}
            onChange={(e) => props.setReviewObstacle(e.target.value)}
          />
          <input
            placeholder="调整方案（100字内）"
            value={props.reviewAdjustment}
            maxLength={100}
            onChange={(e) => props.setReviewAdjustment(e.target.value)}
          />
          <button onClick={() => props.onAddReview(task)}>保存覆盘</button>
        </>
      )}
      {task.reviews.map((r) => (
        <div key={r.id} className="review-item">
          <p className="tiny">有效行动：{r.effectiveAction}</p>
          <p className="tiny">实际阻碍：{r.actualObstacle}</p>
          <p className="tiny">调整方案：{r.adjustment}</p>
          <p className="tiny">时间：{formatTime(r.createdAt)}</p>
        </div>
      ))}

      <div className="section-title">更新日志</div>
      {task.logs.length === 0 && <p className="muted">暂无更新</p>}
      {task.logs.slice(0, 5).map((log) => {
        const fieldLabelMap: Record<TaskUpdateLog["field"], string> = {
          title: "任务标题",
          forWhomWhy: "为谁为何做",
          successMetric: "如何量化成果",
          obstacles: "有何阻碍"
        };
        const oldText = (log.oldValue ?? "").trim() || "空";
        const newText = (log.newValue ?? "").trim() || "空";
        return (
          <div key={log.id} className="review-item">
            <p className="tiny">{fieldLabelMap[log.field]}：{oldText} {"->"} {newText}</p>
            <p className="tiny">时间：{formatTime(log.at)}</p>
          </div>
        );
      })}

      <div className="section-title fold-head">
        <span>归档</span>
        <button onClick={() => toggleSection("archive")}>{openSections.archive ? "收起" : "展开"}</button>
      </div>
      {openSections.archive && (
        <>
          <input
            placeholder="可复用模板名称（必填，30字内）"
            value={props.archiveTemplateName}
            maxLength={30}
            onChange={(e) => props.setArchiveTemplateName(e.target.value)}
          />
          <textarea
            placeholder="核心经验（必填，200字内）"
            value={props.archiveExperience}
            maxLength={200}
            onChange={(e) => props.setArchiveExperience(e.target.value)}
          />
          <button onClick={() => props.onArchiveTask(task)}>完成归档</button>
        </>
      )}

      {previewMaterial && (
        <div
          className="preview-mask"
          onClick={() => {
            setPreviewMaterial(null);
            setPreviewText("");
            setPreviewError("");
            setPreviewLoading(false);
          }}
        >
          <div className="preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="inline-actions">
              <strong>{previewMaterial.name}</strong>
              <button
                className="btn-mini btn-ghost"
                onClick={() => {
                  setPreviewMaterial(null);
                  setPreviewText("");
                  setPreviewError("");
                  setPreviewLoading(false);
                }}
              >
                关闭
              </button>
            </div>
            {previewMaterial.type === "file" && previewMaterial.fileMeta?.mime.startsWith("image/") && (
              <img className="preview-image" src={previewMaterial.fileMeta.dataUrl} alt={previewMaterial.name} />
            )}
            {previewMaterial.type === "image" && previewMaterial.url && (
              <img className="preview-image" src={previewMaterial.url} alt={previewMaterial.name} />
            )}
            {(previewMaterial.type === "text" || previewMaterial.type === "code") && (
              <pre className="preview-text">{previewText || previewMaterial.content || "空内容"}</pre>
            )}
            {previewMaterial.type === "file" &&
              !previewMaterial.fileMeta?.mime.startsWith("image/") &&
              (previewLoading ? (
                <p className="tiny">加载中...</p>
              ) : previewError ? (
                <p className="tiny">{previewError}</p>
              ) : previewText ? (
                <pre className="preview-text">{previewText}</pre>
              ) : (
                <p className="tiny">该文件不是图片，且无法文本预览。你可以在资料区下载后查看。</p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagSelector(props: { tags: Tag[]; selected: string[]; onChange: (ids: string[]) => void }) {
  function toggle(id: string): void {
    const exists = props.selected.includes(id);
    if (exists) {
      props.onChange(props.selected.filter((x) => x !== id));
      return;
    }
    if (props.selected.length >= 3) {
      window.alert("最多选择 3 个标签");
      return;
    }
    props.onChange([...props.selected, id]);
  }

  return (
    <div className="chips">
      {props.tags.map((tag) => (
        <button
          key={tag.id}
          className={props.selected.includes(tag.id) ? "chip active" : "chip"}
          onClick={() => toggle(tag.id)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}

function MiniLineChart(props: { labels: string[]; series: number[][] }) {
  const width = 700;
  const height = 220;
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const all = props.series.flat();
  const maxV = Math.max(1, ...all);

  const colors = ["#4b7cff", "#1fa971", "#f08c2b"];

  function points(values: number[]): string {
    return values
      .map((v, i) => {
        const x = pad + (innerW * i) / Math.max(1, values.length - 1);
        const y = pad + innerH - (v / maxV) * innerH;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#c8d5f3" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#c8d5f3" />
        {props.series.map((s, idx) => (
          <polyline
            key={String(idx)}
            fill="none"
            strokeWidth="3"
            stroke={colors[idx % colors.length]}
            points={points(s)}
          />
        ))}
      </svg>
      <div className="chart-legend">
        <span className="legend idea">灵感</span>
        <span className="legend task">任务</span>
        <span className="legend archive">归档</span>
      </div>
      <div className="chart-labels">
        {props.labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntil(ts: string): number {
  const now = new Date();
  const target = new Date(ts);
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((startTarget.getTime() - startNow.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveDueAt(preset: DuePreset, customDate: string): string | null {
  const d = new Date();
  if (preset === "permanent") {
    return "2099-12-31T23:59:00.000Z";
  }
  if (preset === "custom") {
    if (!customDate) {
      return null;
    }
    const custom = new Date(customDate);
    if (Number.isNaN(custom.getTime())) {
      return null;
    }
    custom.setHours(23, 59, 0, 0);
    return custom.toISOString();
  }

  d.setHours(23, 59, 0, 0);
  d.setDate(d.getDate() + Number(preset));
  return d.toISOString();
}

function isPermanentDue(ts: string): boolean {
  return new Date(ts).getFullYear() >= 2099;
}

export default App;
