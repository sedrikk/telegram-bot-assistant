import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'assistant.db');
const db = new Database(dbPath);

// Enable WAL mode for better write performance
db.pragma('journal_mode = WAL');

export interface Thought {
  id: number;
  content: string;
  tags: string | null;
  category: string | null;
  analyzed_feedback: string | null;
  source_chat: string | null;
  source_user: string | null;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

export interface Reminder {
  id: number;
  user_id: number;
  message: string;
  remind_at: string;
  status: string;
  created_at: string;
}

// Initialize tables
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tags TEXT,
      category TEXT,
      analyzed_feedback TEXT,
      source_chat TEXT,
      source_user TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'idea',
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

// --- THOUGHTS OPERATIONS ---

export function saveThought(
  content: string,
  tags: string | null,
  category: string | null,
  analyzedFeedback: string | null,
  sourceChat: string | null,
  sourceUser: string | null
): number {
  const stmt = db.prepare(`
    INSERT INTO thoughts (content, tags, category, analyzed_feedback, source_chat, source_user)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(content, tags, category, analyzedFeedback, sourceChat, sourceUser);
  return Number(result.lastInsertRowid);
}

export function getThoughts(limit = 10, offset = 0): Thought[] {
  const stmt = db.prepare('SELECT * FROM thoughts ORDER BY created_at DESC LIMIT ? OFFSET ?');
  return stmt.all(limit, offset) as Thought[];
}

export function searchThoughts(query: string): Thought[] {
  const stmt = db.prepare('SELECT * FROM thoughts WHERE content LIKE ? OR tags LIKE ? OR category LIKE ? ORDER BY created_at DESC');
  const likeQuery = `%${query}%`;
  return stmt.all(likeQuery, likeQuery, likeQuery) as Thought[];
}

// --- PROJECTS OPERATIONS ---

export function saveProject(
  name: string,
  description: string | null,
  status = 'idea',
  notes: string | null = null
): number {
  const stmt = db.prepare(`
    INSERT INTO projects (name, description, status, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = coalesce(excluded.description, description),
      status = excluded.status,
      notes = coalesce(excluded.notes, notes),
      updated_at = datetime('now', 'localtime')
  `);
  const result = stmt.run(name, description, status, notes);
  return Number(result.lastInsertRowid);
}

export function getProjects(): Project[] {
  const stmt = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
  return stmt.all() as Project[];
}

export function getProjectByName(name: string): Project | null {
  const stmt = db.prepare('SELECT * FROM projects WHERE name = ?');
  const row = stmt.get(name);
  return row ? (row as Project) : null;
}

export function updateProjectNotes(name: string, notes: string): boolean {
  const stmt = db.prepare(`
    UPDATE projects 
    SET notes = ?, updated_at = datetime('now', 'localtime')
    WHERE name = ?
  `);
  const result = stmt.run(notes, name);
  return result.changes > 0;
}

export function updateProjectStatus(name: string, status: string): boolean {
  const stmt = db.prepare(`
    UPDATE projects 
    SET status = ?, updated_at = datetime('now', 'localtime')
    WHERE name = ?
  `);
  const result = stmt.run(status, name);
  return result.changes > 0;
}

// --- REMINDERS OPERATIONS ---

export function saveReminder(userId: number, message: string, remindAt: string): number {
  const stmt = db.prepare(`
    INSERT INTO reminders (user_id, message, remind_at, status)
    VALUES (?, ?, ?, 'pending')
  `);
  const result = stmt.run(userId, message, remindAt);
  return Number(result.lastInsertRowid);
}

export function getPendingReminders(): Reminder[] {
  const stmt = db.prepare("SELECT * FROM reminders WHERE status = 'pending'");
  return stmt.all() as Reminder[];
}

export function completeReminder(id: number): boolean {
  const stmt = db.prepare("UPDATE reminders SET status = 'completed' WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function cancelReminder(id: number): boolean {
  const stmt = db.prepare("UPDATE reminders SET status = 'cancelled' WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
