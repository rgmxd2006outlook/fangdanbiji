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
        tagIds: a.tagIds ?? []
      })),
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
          tagIds: action.tagIds ?? []
        })),
        materials: a.taskSnapshot.materials ?? [],
        reviews: a.taskSnapshot.reviews ?? [],
        logs: a.taskSnapshot.logs ?? [],
        tagIds: a.taskSnapshot.tagIds ?? []
      }
    }));
    return {
      ...initialData,
      ...parsed,
      tasks: normalizedTasks,
      archives: normalizedArchives,
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
