import schedule from 'node-schedule';
import { Telegraf } from 'telegraf';
import * as chrono from 'chrono-node';
import { completeReminder, getPendingReminders, saveReminder, Reminder } from './db';
import { markdownToHtml } from './formatting';

// Store in-memory references to active schedule jobs
const activeJobs = new Map<number, schedule.Job>();

/**
 * Parses natural language reminder text.
 * E.g., "remind me to call Mom tomorrow at 5pm" ->
 * cleanText: "Call Mom", date: Date object for tomorrow at 5:00 PM
 */
export function parseReminderText(input: string): { cleanText: string; date: Date | null } {
  // Use chrono-node to parse date/time relative to now, assuming future date references
  const parsedResults = chrono.parse(input, new Date(), { forwardDate: true });
  if (parsedResults.length === 0) {
    return { cleanText: input, date: null };
  }

  const result = parsedResults[0];
  const date = result.date();

  // Strip out the parsed date-time text from the original text
  let cleanText = input.replace(result.text, '').trim();

  // Remove helper keywords / punctuation
  cleanText = cleanText
    .replace(/^(remind me to|remind me|remind|alert me to|alert me|alert|schedule a reminder for|schedule a reminder to)\s+/i, '')
    .replace(/\s+at\s+$/i, '')
    .replace(/\s+in\s+$/i, '')
    .replace(/\s+on\s+$/i, '')
    .replace(/^(to)\s+/i, '')
    .trim();

  // Clean trailing punctuation or whitespace
  cleanText = cleanText.replace(/^[,\s;]+|[,\s;]+$/g, '');

  if (cleanText) {
    cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
  } else {
    cleanText = "Scheduled Alert";
  }

  return { cleanText, date };
}

/**
 * Starts the scheduler and recovers all pending reminders from the database.
 */
export function initScheduler(bot: Telegraf<any>) {
  const pending = getPendingReminders();
  const now = new Date();

  console.log(`[Scheduler] Initializing. Recovering pending reminders from DB...`);
  let recoveredCount = 0;
  let triggeredImmediatelyCount = 0;

  for (const reminder of pending) {
    const remindAt = new Date(reminder.remind_at);
    if (remindAt <= now) {
      // The reminder was scheduled for a time when the bot was offline. Trigger it immediately.
      triggerReminder(bot, reminder);
      triggeredImmediatelyCount++;
    } else {
      // Re-schedule future reminder
      scheduleReminderJob(bot, reminder);
      recoveredCount++;
    }
  }

  console.log(`[Scheduler] Startup complete. Re-scheduled: ${recoveredCount}, Triggered missed: ${triggeredImmediatelyCount}`);
}

/**
 * Schedules a new reminder job in memory and saves it to SQLite.
 */
export function createAndScheduleReminder(
  bot: Telegraf<any>,
  userId: number,
  message: string,
  remindAt: Date
): number {
  // 1. Save reminder to database
  const remindAtISO = remindAt.toISOString();
  const id = saveReminder(userId, message, remindAtISO);

  // 2. Schedule the job
  const dummyReminder: Reminder = {
    id,
    user_id: userId,
    message,
    remind_at: remindAtISO,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  scheduleReminderJob(bot, dummyReminder);
  return id;
}

/**
 * Schedules an in-memory job for an existing database reminder.
 */
function scheduleReminderJob(bot: Telegraf<any>, reminder: Reminder) {
  // Cancel existing job with this ID just in case
  cancelReminderJob(reminder.id);

  const remindAtDate = new Date(reminder.remind_at);
  const job = schedule.scheduleJob(remindAtDate, () => {
    triggerReminder(bot, reminder);
  });

  if (job) {
    activeJobs.set(reminder.id, job);
  }
}

/**
 * Triggers the reminder: sends message to user and marks it completed in DB.
 */
async function triggerReminder(bot: Telegraf<any>, reminder: Reminder) {
  try {
    const htmlText = markdownToHtml(`⏰ *Reminder Alert!*\n\n> ${reminder.message}`);
    await bot.telegram.sendMessage(
      reminder.user_id,
      htmlText,
      { parse_mode: 'HTML' }
    );
    completeReminder(reminder.id);
    activeJobs.delete(reminder.id);
    console.log(`[Scheduler] Reminder ${reminder.id} sent to user ${reminder.user_id}`);
  } catch (error) {
    console.error(`[Scheduler] Failed to send reminder ${reminder.id} to user ${reminder.user_id}:`, error);
  }
}

/**
 * Cancels a reminder job.
 */
export function cancelReminderJob(reminderId: number) {
  if (activeJobs.has(reminderId)) {
    activeJobs.get(reminderId)?.cancel();
    activeJobs.delete(reminderId);
  }
}
