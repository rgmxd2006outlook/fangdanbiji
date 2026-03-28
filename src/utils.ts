import type { AppData, SearchResult } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function toMinuteOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  return h * 60 + m;
}

export function shouldTriggerDailyReminder(reminderTime: string, lastDate: string | null): boolean {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastDate === today) {
    return false;
  }
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  return nowMinute >= toMinuteOfDay(reminderTime);
}

export function daysAgo(ts: string): number {
  const diff = Date.now() - new Date(ts).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) {
    return 0;
  }
  if (x === y) {
    return 1;
  }
  const bgA = bigrams(x);
  const bgB = bigrams(y);
  const setB = new Map<string, number>();

  for (const t of bgB) {
    setB.set(t, (setB.get(t) ?? 0) + 1);
  }

  let matches = 0;
  for (const t of bgA) {
    const count = setB.get(t) ?? 0;
    if (count > 0) {
      matches += 1;
      setB.set(t, count - 1);
    }
  }

  return (2 * matches) / (bgA.length + bgB.length);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

function bigrams(s: string): string[] {
  if (s.length < 2) {
    return [s];
  }
  const list: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) {
    list.push(s.slice(i, i + 2));
  }
  return list;
}

function scoreText(tokens: string[], text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (t.includes(token)) {
      score += 1;
    }
  }
  return score;
}

export function searchAll(data: AppData, q: string): SearchResult[] {
  const tokens = q
    .toLowerCase()
    .split(" ")
    .map((v) => v.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const idea of data.ideas.filter((i) => i.status !== "deleted")) {
    const text = `${idea.title} ${idea.detail}`;
    const score = scoreText(tokens, text);
    if (score > 0) {
      results.push({
        id: `idea_${idea.id}`,
        module: "idea",
        title: idea.title,
        snippet: idea.detail,
        createdAt: idea.createdAt,
        score,
        refId: idea.id
      });
    }
  }

  for (const task of data.tasks) {
    const materialText = (task.materials ?? [])
      .map((m) => `${m.name} ${m.url ?? ""}`)
      .join(" ");
    const taskText = `${task.title} ${task.forWhomWhy} ${task.successMetric} ${task.obstacles} ${materialText}`;
    const taskScore = scoreText(tokens, taskText);
    if (taskScore > 0) {
      results.push({
        id: `task_${task.id}`,
        module: "task",
        title: task.title,
        snippet: `${task.forWhomWhy} / ${task.successMetric}`,
        createdAt: task.createdAt,
        score: taskScore,
        refId: task.id
      });
    }

    for (const action of task.actions) {
      const actionScore = scoreText(tokens, action.content);
      if (actionScore > 0) {
        results.push({
          id: `action_${action.id}`,
          module: "action",
          title: `${task.title} - 行动`,
          snippet: action.content,
          createdAt: action.createdAt,
          score: actionScore,
          refId: task.id
        });
      }
    }
  }

  for (const archive of data.archives) {
    const text = `${archive.templateName} ${archive.coreExperience} ${archive.originTaskTitle}`;
    const score = scoreText(tokens, text);
    if (score > 0) {
      results.push({
        id: `archive_${archive.id}`,
        module: "archive",
        title: archive.templateName,
        snippet: archive.coreExperience,
        createdAt: archive.archivedAt,
        score,
        refId: archive.id
      });
    }
  }

  for (const stash of data.stashes.filter((s) => s.status !== "deleted")) {
    const text = `${stash.title} ${stash.contentText} ${stash.links.join(" ")}`;
    const score = scoreText(tokens, text);
    if (score > 0) {
      results.push({
        id: `stash_${stash.id}`,
        module: "stash",
        title: stash.title,
        snippet: stash.contentText || stash.links[0] || "-",
        createdAt: stash.createdAt,
        score,
        refId: stash.id
      });
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
