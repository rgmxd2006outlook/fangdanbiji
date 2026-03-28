import { useEffect, useMemo, useState } from "react";
import { backupToCloud, decryptAppData, encryptAppData, listCloudBackups, restoreFromCloud } from "./backup";
import { loadData, saveData } from "./storage";
import type { AppData, Idea, Material, Review, TabKey, Tag, Task, TaskAction, TaskUpdateLog } from "./types";
import { daysAgo, formatTime, nowIso, searchAll, shouldTriggerDailyReminder, similarity, uid } from "./utils";

type DraftMap = Record<string, { taskId: string; action: string }>;

type DuePreset = "1" | "3" | "7" | "custom";

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterTagId, setFilterTagId] = useState("");

  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDetail, setIdeaDetail] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [forWhomWhy, setForWhomWhy] = useState("");
  const [successMetric, setSuccessMetric] = useState("");
  const [obstacles, setObstacles] = useState("");

  const [linkTaskId, setLinkTaskId] = useState("");
  const [linkIdeaId, setLinkIdeaId] = useState("");
  const [linkActionContent, setLinkActionContent] = useState("");

  const [archiveTemplateName, setArchiveTemplateName] = useState("");
  const [archiveExperience, setArchiveExperience] = useState("");

  const [reviewEffectiveAction, setReviewEffectiveAction] = useState("");
  const [reviewObstacle, setReviewObstacle] = useState("");
  const [reviewAdjustment, setReviewAdjustment] = useState("");

  const [customTagName, setCustomTagName] = useState("");

  const [stashTitle, setStashTitle] = useState("");
  const [stashContent, setStashContent] = useState("");
  const [stashLinksInput, setStashLinksInput] = useState("");
  const [duePreset, setDuePreset] = useState<DuePreset>("1");
  const [dueCustomDate, setDueCustomDate] = useState("");
  const [stashDrafts, setStashDrafts] = useState<DraftMap>({});
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupRecords, setBackupRecords] = useState<Array<{ id: string; createdAt: string; size: number; version: string }>>([]);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    saveData(data);
  }, [data]);

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

  const filteredTasks = useMemo(() => {
    if (!filterTagId) {
      return activeTasks;
    }
    return activeTasks.filter((t) => t.tagIds.includes(filterTagId) || t.actions.some((a) => a.tagIds.includes(filterTagId)));
  }, [activeTasks, filterTagId]);

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
    setTab("tasks");
  }

  function convertIdeaToAction(): void {
    const taskId = linkTaskId || selectedTaskId;
    if (!taskId) {
      window.alert("请先选择任务");
      return;
    }

    const content = linkActionContent.trim();
    if (!content || content.length > 100) {
      window.alert("行动内容必填，且需 <= 100 字");
      return;
    }

    updateData((prev) => {
      const action: TaskAction = {
        id: uid("action"),
        content,
        ideaId: linkIdeaId || undefined,
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
          if (i.id === linkIdeaId) {
            return { ...i, status: "converted" };
          }
          return i;
        })
      };
    });

    setLinkActionContent("");
    setLinkIdeaId("");
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
        const log: TaskUpdateLog = {
          id: uid("log"),
          field,
          at: nowIso()
        };
        return {
          ...t,
          [field]: value,
          updatedAt: nowIso(),
          logs: [log, ...t.logs]
        };
      })
    }));
  }

  function setTaskTags(taskId: string, tagIds: string[]): void {
    if (tagIds.length > 3) {
      window.alert("任务最多 3 个标签");
      return;
    }
    updateData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, tagIds, updatedAt: nowIso() } : t))
    }));
  }

  function addActionToTask(taskId: string, content: string, tagIds: string[]): void {
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
        return {
          ...t,
          updatedAt: nowIso(),
          actions: [
            {
              id: uid("action"),
              content: c,
              status: "todo",
              tagIds,
              createdAt: nowIso()
            },
            ...t.actions
          ]
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
    patch: Partial<Pick<Material, "name" | "url">>
  ): void {
    const name = patch.name?.trim();
    const url = patch.url?.trim();
    if (patch.name !== undefined && !name) {
      window.alert("资料名称不能为空");
      return;
    }
    if (patch.url !== undefined && !url) {
      window.alert("资料链接不能为空");
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
                  ...(patch.url !== undefined ? { url } : {})
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
          actions: t.actions.filter((a) => a.id !== actionId)
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
      setTab("ideas");
      setSelectedIdeaId(refId);
      return;
    }
    if (module === "archive") {
      setTab("archives");
      return;
    }
    if (module === "stash") {
      setTab("stash");
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
    const title = stashTitle.trim();
    const contentText = stashContent.trim();
    if (!title) {
      window.alert("暂存标题必填");
      return;
    }
    if (title.length > 50) {
      window.alert("暂存标题最多 50 字");
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

    updateData((prev) => ({
      ...prev,
      stashes: [
        {
          id: uid("stash"),
          title,
          contentText,
          links,
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
    setDuePreset("1");
    setDueCustomDate("");
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

    addActionToTask(draft.taskId, draft.action, []);

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

  function reuseArchive(archiveId: string): void {
    updateData((prev) => {
      const archive = prev.archives.find((a) => a.id === archiveId);
      if (!archive) {
        return prev;
      }

      const now = nowIso();
      const base = archive.taskSnapshot;
      const actionIdMap = new Map<string, string>();
      const reusedActions = base.actions.map((a) => {
        const newId = uid("action");
        actionIdMap.set(a.id, newId);
        return {
          id: newId,
          content: a.content,
          ideaId: undefined,
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
        tagIds: base.tagIds.slice(0, 3),
        status: "active",
        createdAt: now,
        updatedAt: now,
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>防弹笔记法</h1>
        <button className={tab === "dashboard" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("dashboard")}>首页</button>
        <button className={tab === "ideas" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("ideas")}>灵感收集箱</button>
        <button className={tab === "tasks" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("tasks")}>核心任务库</button>
        <button className={tab === "archives" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("archives")}>经验沉淀库</button>
        <button className={tab === "stash" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("stash")}>暂存收集箱</button>
        <button className={tab === "settings" ? "nav-btn active" : "nav-btn"} onClick={() => setTab("settings")}>设置与备份</button>

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
      </aside>

      <main className="main">
        <header className="topbar">
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
              <p>待处理暂存：{pendingStashes.length}</p>
              <p>已沉淀经验：{data.archives.length}</p>
            </article>
            <article className="card span2">
              <h2>近 7 天趋势（灵感 / 任务 / 归档）</h2>
              <MiniLineChart labels={trend.labels} series={[trend.ideas, trend.tasks, trend.archives]} />
            </article>
          </section>
        )}

        {tab === "ideas" && (
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
              {data.ideas
                .filter((i) => i.status !== "deleted")
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((idea) => (
                  <div
                    key={idea.id}
                    className={selectedIdeaId === idea.id ? "list-item selected" : "list-item"}
                    onClick={() => setSelectedIdeaId(idea.id)}
                  >
                    <div>
                      <strong>{idea.title}</strong>
                      <p className="muted">{idea.detail || "-"}</p>
                      <p className="tiny">{formatTime(idea.createdAt)}</p>
                    </div>
                    <div className="inline-actions">
                      {idea.status === "unprocessed" ? <span className="badge">未处理</span> : <span className="badge done">已转化</span>}
                      <button onClick={(e) => { e.stopPropagation(); deleteIdea(idea.id); }}>删除</button>
                    </div>
                  </div>
                ))}
            </article>
          </section>
        )}

        {tab === "tasks" && (
          <section className="grid two">
            <article className="card">
              <h2>创建核心任务</h2>
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
              <button onClick={createTask}>添加核心任务</button>
            </article>

            <article className="card">
              <h2>灵感转行动</h2>
              <select value={linkTaskId} onChange={(e) => setLinkTaskId(e.target.value)}>
                <option value="">关联任务（默认当前选中任务）</option>
                {activeTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <select value={linkIdeaId} onChange={(e) => setLinkIdeaId(e.target.value)}>
                <option value="">转化灵感（可选）</option>
                {unprocessedIdeas.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </select>
              <input
                placeholder="具体行动（必填，100字内）"
                value={linkActionContent}
                maxLength={100}
                onChange={(e) => setLinkActionContent(e.target.value)}
              />
              <button onClick={convertIdeaToAction}>灵感转行动</button>
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
              <select value={filterTagId} onChange={(e) => setFilterTagId(e.target.value)}>
                <option value="">按标签筛选任务/行动（全部）</option>
                {data.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </article>

            <article className="card">
              <h2>任务列表</h2>
              {filteredTasks.length === 0 && <p className="muted">暂无任务</p>}
              {filteredTasks.map((t) => (
                <button
                  key={t.id}
                  className={selectedTaskId === t.id ? "list-item selected" : "list-item"}
                  onClick={() => setSelectedTaskId(t.id)}
                >
                  <span>{t.title}</span>
                  <span className="tiny">{formatTime(t.createdAt)}</span>
                </button>
              ))}
            </article>

            <article className="card">
              <h2>任务详情</h2>
              {!selectedTask && <p className="muted">请选择任务</p>}
              {selectedTask && (
                <TaskDetail
                  task={selectedTask}
                  ideas={data.ideas}
                  tags={data.tags}
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
                  onSetTaskTags={setTaskTags}
                  onSetActionTags={updateActionTags}
                  onToggleAction={toggleAction}
                  onDeleteAction={deleteAction}
                  onAddAction={addActionToTask}
                  onAddMaterialLink={addMaterialLink}
                  onAddMaterialFile={addMaterialFile}
                  onUpdateMaterial={updateMaterial}
                  onDeleteMaterial={deleteMaterial}
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

        {tab === "stash" && (
          <section className="grid two">
            <article className="card">
              <h2>新增暂存</h2>
              <input
                placeholder="暂存标题（必填，50字内）"
                value={stashTitle}
                maxLength={50}
                onChange={(e) => setStashTitle(e.target.value)}
              />
              <textarea
                placeholder="暂存内容（文本）"
                value={stashContent}
                onChange={(e) => setStashContent(e.target.value)}
              />
              <textarea
                placeholder="链接（多个可用空格/换行分隔）"
                value={stashLinksInput}
                onChange={(e) => setStashLinksInput(e.target.value)}
              />
              <div className="inline-actions">
                <select value={duePreset} onChange={(e) => setDuePreset(e.target.value as DuePreset)}>
                  <option value="1">1 天</option>
                  <option value="3">3 天</option>
                  <option value="7">7 天</option>
                  <option value="custom">自定义日期</option>
                </select>
                {duePreset === "custom" && (
                  <input type="date" value={dueCustomDate} onChange={(e) => setDueCustomDate(e.target.value)} />
                )}
              </div>
              <button onClick={addStash}>添加暂存</button>
            </article>

            <article className="card">
              <h2>待处理暂存</h2>
              {pendingStashes.length === 0 && <p className="muted">暂无待处理暂存</p>}
              {pendingStashes.map((s) => {
                const d = stashDrafts[s.id] ?? { taskId: "", action: "" };
                return (
                  <div key={s.id} className="archive-item">
                    <div>
                      <p><strong>{s.title}</strong></p>
                      <p>{s.contentText || "-"}</p>
                      <p className="tiny">到期：{formatTime(s.dueAt)}</p>
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
                      <button onClick={() => stashToAction(s.id)}>转化为任务行动</button>
                      <button onClick={() => attachStashToTask(s.id)}>关联到现有任务</button>
                      <button onClick={() => deleteStash(s.id)}>删除</button>
                    </div>
                  </div>
                );
              })}
            </article>
          </section>
        )}

        {tab === "settings" && (
          <section className="grid two">
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
  tags: Tag[];
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
  onSetTaskTags: (taskId: string, tagIds: string[]) => void;
  onSetActionTags: (taskId: string, actionId: string, tagIds: string[]) => void;
  onAddAction: (taskId: string, content: string, tagIds: string[]) => void;
  onAddMaterialLink: (taskId: string, actionId: string, name: string, url: string) => void;
  onAddMaterialFile: (taskId: string, actionId: string, file: File) => void;
  onUpdateMaterial: (taskId: string, materialId: string, patch: Partial<Pick<Material, "name" | "url">>) => void;
  onDeleteMaterial: (taskId: string, materialId: string) => void;
  onToggleAction: (taskId: string, actionId: string) => void;
  onDeleteAction: (taskId: string, actionId: string) => void;
  onAddReview: (task: Task) => void;
  onArchiveTask: (task: Task) => void;
}) {
  const { task } = props;
  const [newAction, setNewAction] = useState("");
  const [newActionTagIds, setNewActionTagIds] = useState<string[]>([]);
  const [linkNameDrafts, setLinkNameDrafts] = useState<Record<string, string>>({});
  const [linkUrlDrafts, setLinkUrlDrafts] = useState<Record<string, string>>({});
  const [editNameDrafts, setEditNameDrafts] = useState<Record<string, string>>({});
  const [editUrlDrafts, setEditUrlDrafts] = useState<Record<string, string>>({});
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    actions: true,
    materials: false,
    review: false,
    archive: false
  });

  function toggleSection(key: "actions" | "materials" | "review" | "archive"): void {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="task-detail">
      <label>
        任务标题
        <input value={task.title} maxLength={50} onChange={(e) => props.onUpdateField(task.id, "title", e.target.value)} />
      </label>
      <label>
        为谁为何做
        <textarea
          value={task.forWhomWhy}
          maxLength={100}
          onChange={(e) => props.onUpdateField(task.id, "forWhomWhy", e.target.value)}
        />
      </label>
      <label>
        如何量化成果
        <textarea
          value={task.successMetric}
          maxLength={100}
          onChange={(e) => props.onUpdateField(task.id, "successMetric", e.target.value)}
        />
      </label>
      <label>
        有何阻碍
        <textarea value={task.obstacles} maxLength={100} onChange={(e) => props.onUpdateField(task.id, "obstacles", e.target.value)} />
      </label>

      <div className="section-title">任务标签（1-3）</div>
      <TagSelector
        tags={props.tags}
        selected={task.tagIds}
        onChange={(ids) => props.onSetTaskTags(task.id, ids)}
      />

      <div className="section-title fold-head">
        <span>行动</span>
        <button onClick={() => toggleSection("actions")}>{openSections.actions ? "收起" : "展开"}</button>
      </div>
      {openSections.actions && (
        <>
          <div className="inline-actions col">
            <input
              placeholder="新增行动（100字内）"
              value={newAction}
              maxLength={100}
              onChange={(e) => setNewAction(e.target.value)}
            />
            <TagSelector tags={props.tags} selected={newActionTagIds} onChange={setNewActionTagIds} />
            <button
              onClick={() => {
                props.onAddAction(task.id, newAction, newActionTagIds);
                setNewAction("");
                setNewActionTagIds([]);
              }}
            >
              添加行动
            </button>
          </div>

          {task.actions.length === 0 && <p className="muted">暂无行动</p>}
          {task.actions.map((action) => {
            const source = props.ideas.find((i) => i.id === action.ideaId);
            return (
              <div key={action.id} className="action-item">
                <div>
                  <p className={action.status === "done" ? "done-text" : ""}>{action.content}</p>
                  <p className="tiny">关联灵感：{source?.title ?? "-"}</p>
                  <p className="tiny">创建时间：{formatTime(action.createdAt)}</p>
                  <TagSelector
                    tags={props.tags}
                    selected={action.tagIds}
                    onChange={(ids) => props.onSetActionTags(task.id, action.id, ids)}
                  />
                </div>
                <div className="inline-actions col">
                  <button onClick={() => props.onToggleAction(task.id, action.id)}>
                    {action.status === "done" ? "取消完成" : "标记完成"}
                  </button>
                  <button onClick={() => props.onDeleteAction(task.id, action.id)}>删除</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="section-title fold-head">
        <span>资料</span>
        <button onClick={() => toggleSection("materials")}>{openSections.materials ? "收起" : "展开"}</button>
      </div>
      {openSections.materials && (
        <>
          {task.actions.length === 0 && <p className="muted">请先新增行动，再为行动绑定资料</p>}
          {task.actions.map((action) => {
            const actionMaterials = props.materials.filter((m) => m.actionId === action.id);
            return (
              <div key={action.id} className="material-box">
                <p className="tiny"><strong>行动：{action.content}</strong></p>
                {actionMaterials.length === 0 && <p className="tiny">暂无资料</p>}
                {actionMaterials.map((m) => (
                  <div key={m.id} className="material-item">
                    <div className="material-main">
                      {m.type === "link" && m.url && (
                        <a href={m.url} target="_blank" rel="noreferrer">{m.name}</a>
                      )}
                      {m.type === "file" && m.fileMeta && (
                        <a href={m.fileMeta.dataUrl} download={m.name}>{m.name}</a>
                      )}
                      <span className="tiny">{m.type === "file" ? "文件" : "链接"} | {formatTime(m.createdAt)}</span>
                    </div>
                    {editingMaterialId !== m.id && (
                      <div className="inline-actions">
                        <button
                          onClick={() => {
                            setEditingMaterialId(m.id);
                            setEditNameDrafts((prev) => ({ ...prev, [m.id]: m.name }));
                            if (m.type === "link") {
                              setEditUrlDrafts((prev) => ({ ...prev, [m.id]: m.url ?? "" }));
                            }
                          }}
                        >
                          编辑
                        </button>
                        <button onClick={() => props.onDeleteMaterial(task.id, m.id)}>删除</button>
                      </div>
                    )}
                    {editingMaterialId === m.id && (
                      <div className="material-edit">
                        <input
                          placeholder="新资料名称"
                          value={editNameDrafts[m.id] ?? ""}
                          onChange={(e) => setEditNameDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        />
                        {m.type === "link" && (
                          <input
                            placeholder="新资料链接"
                            value={editUrlDrafts[m.id] ?? ""}
                            onChange={(e) => setEditUrlDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          />
                        )}
                        <div className="inline-actions">
                          <button
                            onClick={() => {
                              const nextName = editNameDrafts[m.id] ?? m.name;
                              if (m.type === "link") {
                                const nextUrl = editUrlDrafts[m.id] ?? m.url ?? "";
                                props.onUpdateMaterial(task.id, m.id, { name: nextName, url: nextUrl });
                              } else {
                                props.onUpdateMaterial(task.id, m.id, { name: nextName });
                              }
                              setEditingMaterialId(null);
                            }}
                          >
                            保存
                          </button>
                          <button onClick={() => setEditingMaterialId(null)}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="inline-actions col">
                  <input
                    placeholder="资料名称"
                    value={linkNameDrafts[action.id] ?? ""}
                    onChange={(e) => setLinkNameDrafts((prev) => ({ ...prev, [action.id]: e.target.value }))}
                  />
                  <input
                    placeholder="资料链接（https://...）"
                    value={linkUrlDrafts[action.id] ?? ""}
                    onChange={(e) => setLinkUrlDrafts((prev) => ({ ...prev, [action.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => {
                      props.onAddMaterialLink(
                        task.id,
                        action.id,
                        linkNameDrafts[action.id] ?? "",
                        linkUrlDrafts[action.id] ?? ""
                      );
                      setLinkNameDrafts((prev) => ({ ...prev, [action.id]: "" }));
                      setLinkUrlDrafts((prev) => ({ ...prev, [action.id]: "" }));
                    }}
                  >
                    添加链接资料
                  </button>
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      props.onAddMaterialFile(task.id, action.id, file);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="section-title fold-head">
        <span>覆盘</span>
        <button onClick={() => toggleSection("review")}>{openSections.review ? "收起" : "展开"}</button>
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
          {task.reviews.map((r) => (
            <div key={r.id} className="review-item">
              <p className="tiny">有效行动：{r.effectiveAction}</p>
              <p className="tiny">实际阻碍：{r.actualObstacle}</p>
              <p className="tiny">调整方案：{r.adjustment}</p>
              <p className="tiny">时间：{formatTime(r.createdAt)}</p>
            </div>
          ))}
        </>
      )}

      <div className="section-title">更新日志</div>
      {task.logs.length === 0 && <p className="muted">暂无更新</p>}
      {task.logs.slice(0, 5).map((log) => (
        <p key={log.id} className="tiny">{log.field} - {formatTime(log.at)}</p>
      ))}

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

export default App;
