export type IdeaStatus = "unprocessed" | "converted" | "deleted";
export type TaskStatus = "active" | "archived";
export type ActionStatus = "todo" | "done";

export interface Idea {
  id: string;
  title: string;
  detail: string;
  status: IdeaStatus;
  createdAt: string;
}

export interface TaskUpdateLog {
  id: string;
  field: "title" | "forWhomWhy" | "successMetric" | "obstacles";
  at: string;
}

export interface TaskAction {
  id: string;
  content: string;
  ideaId?: string;
  status: ActionStatus;
  tagIds: string[];
  createdAt: string;
}

export interface Review {
  id: string;
  effectiveAction: string;
  actualObstacle: string;
  adjustment: string;
  createdAt: string;
}

export interface Material {
  id: string;
  actionId: string;
  type: "file" | "link";
  name: string;
  url?: string;
  fileMeta?: {
    size: number;
    mime: string;
    dataUrl: string;
  };
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  forWhomWhy: string;
  successMetric: string;
  obstacles: string;
  tagIds: string[];
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  actions: TaskAction[];
  materials: Material[];
  reviews: Review[];
  logs: TaskUpdateLog[];
}

export interface Archive {
  id: string;
  originTaskId: string;
  originTaskTitle: string;
  templateName: string;
  coreExperience: string;
  archivedAt: string;
  taskSnapshot: Task;
  reuseCount: number;
}

export interface AppData {
  ideas: Idea[];
  tasks: Task[];
  archives: Archive[];
  stashes: Stash[];
  tags: Tag[];
  config: {
    ideaReminderTime: string;
    lastIdeaReminderDate: string | null;
    lastCleanupDate: string | null;
    lastReviewReminderDate: string | null;
    lastStashReminderDate: string | null;
  };
}

export interface Stash {
  id: string;
  title: string;
  contentText: string;
  links: string[];
  dueAt: string;
  relatedTaskId?: string;
  status: "pending" | "processed" | "deleted";
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  system: boolean;
}

export interface BackupRecord {
  id: string;
  email: string;
  version: string;
  createdAt: string;
  size: number;
}

export type TabKey = "dashboard" | "ideas" | "tasks" | "archives" | "stash" | "settings";

export interface SearchResult {
  id: string;
  module: "idea" | "task" | "action" | "archive" | "stash";
  title: string;
  snippet: string;
  createdAt: string;
  score: number;
  refId: string;
}
