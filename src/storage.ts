import type { AppData } from "./types";

const STORAGE_KEY = "bulletproof-notes-app-data-v1";

export const initialData: AppData = {
  ideas: [],
  tasks: [],
  archives: [],
  stashes: [],
  tags: [
    { id: "tag_frag", name: "碎片时间可做", system: true },
    { id: "tag_focus", name: "专注1小时", system: true },
    { id: "tag_collab", name: "多人协作", system: true },
    { id: "tag_home", name: "居家执行", system: true },
    { id: "tag_out", name: "外出执行", system: true }
  ],
  config: {
    ideaReminderTime: "20:00",
    lastIdeaReminderDate: null,
    lastCleanupDate: null,
    lastReviewReminderDate: null,
    lastStashReminderDate: null
  }
};

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialData;
    }
    const parsed = JSON.parse(raw) as AppData;
    const normalizedTasks = (parsed.tasks ?? []).map((t) => ({
      ...t,
      actions: (t.actions ?? []).map((a) => ({
        ...a,
        tagIds: a.tagIds ?? [],
        stepId: a.stepId,
        note: a.note ?? "",
        noteEntries:
          a.noteEntries ??
          (a.note
            ? [
                {
                  id: `note_legacy_${a.id}`,
                  content: a.note,
                  createdAt: a.createdAt
                }
              ]
            : [])
      })),
      steps: t.steps ?? [],
      materials: t.materials ?? [],
      reviews: t.reviews ?? [],
      logs: t.logs ?? [],
      tagIds: t.tagIds ?? []
    }));
    const normalizedArchives = (parsed.archives ?? []).map((a) => ({
      ...a,
      taskSnapshot: {
        ...a.taskSnapshot,
        actions: (a.taskSnapshot.actions ?? []).map((action) => ({
          ...action,
          tagIds: action.tagIds ?? [],
          stepId: action.stepId,
          note: action.note ?? "",
          noteEntries:
            action.noteEntries ??
            (action.note
              ? [
                  {
                    id: `note_legacy_${action.id}`,
                    content: action.note,
                    createdAt: action.createdAt
                  }
                ]
              : [])
        })),
        steps: a.taskSnapshot.steps ?? [],
        materials: a.taskSnapshot.materials ?? [],
        reviews: a.taskSnapshot.reviews ?? [],
        logs: a.taskSnapshot.logs ?? [],
        tagIds: a.taskSnapshot.tagIds ?? []
      }
    }));
    const normalizedStashes = (parsed.stashes ?? []).map((s) => ({
      ...s,
      links: s.links ?? [],
      files: s.files ?? [],
      source: s.source ?? "manual"
    }));
    const migratedFromIdeas = (parsed.ideas ?? [])
      .filter((i) => i.status !== "deleted")
      .map((i) => ({
        id: `migrated_${i.id}`,
        title: i.title || "历史灵感",
        contentText: i.detail || i.title,
        links: [],
        files: [],
        source: "manual" as const,
        dueAt: i.createdAt,
        status: i.status === "converted" ? ("processed" as const) : ("pending" as const),
        createdAt: i.createdAt
      }));

    return {
      ...initialData,
      ...parsed,
      tasks: normalizedTasks,
      archives: normalizedArchives,
      stashes: [...normalizedStashes, ...migratedFromIdeas],
      config: {
        ...initialData.config,
        ...parsed.config
      }
    };
  } catch {
    return initialData;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
