import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { 
  initDb, 
  saveThought, 
  getThoughts, 
  searchThoughts, 
  saveProject, 
  getProjects, 
  getProjectByName, 
  updateProjectNotes,
  getPendingReminders,
  cancelReminder
} from './db';
import { 
  classifyMessage, 
  generateFeedback, 
  summarizeForwarded 
} from './llm';
import { 
  parseReminderText, 
  createAndScheduleReminder, 
  initScheduler 
} from './reminders';
import { markdownToHtml } from './formatting';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
  process.exit(1);
}

// 1. Initialize SQLite Database
initDb();

// 2. Initialize Telegraf Bot
const bot = new Telegraf(token);

// 3. Initialize Reminder Scheduler
initScheduler(bot);

// --- HTML REPLY WRAPPER ---
function replyHtml(ctx: any, text: string) {
  return ctx.reply(markdownToHtml(text), { parse_mode: 'HTML' });
}

// --- COMMANDS ---

// /start
bot.start((ctx) => {
  const userName = ctx.from?.first_name || 'there';
  replyHtml(
    ctx,
    `👋 Hello ${userName}! I am *Antigravity*, your intelligent project, thought, and reminder assistant.\n\n` +
    `Here is how you can interact with me:\n\n` +
    `💡 *Send Thoughts / Ideas*: Just type any thought or idea. I will automatically analyze it, categorize it, and provide strategic feedback and actionable next steps.\n\n` +
    `⏰ *Set Reminders*: Send natural language reminders like:\n` +
    `  • _"remind me to check the database in 30 minutes"_\n` +
    `  • _"remind me tomorrow at 9 AM to review project proposal"_\n` +
    `  • _"remind me on Friday to send weekly invoice"_\n\n` +
    `📁 *Projects*: Send updates about your projects, or use commands to manage them:\n` +
    `  • \`/project <name>\` - Create or view details of a project\n` +
    `  • \`/projects\` - List all tracked projects\n\n` +
    `📥 *Forward Messages*: Forward articles or messages from other channels or chats. I will automatically write an executive summary and extract key takeaways.\n\n` +
    `🔍 *Other commands*:\n` +
    `  • \`/ideas\` - List recent thoughts & ideas\n` +
    `  • \`/reminders\` - View pending reminders\n` +
    `  • \`/search <query>\` - Search through all stored thoughts and projects\n` +
    `  • \`/help\` - Show this message again`
  );
});

// /help
bot.help((ctx) => {
  replyHtml(
    ctx,
    `🤖 *Antigravity Assistant Help Menu*\n\n` +
    `• *Thoughts*: Type anything, and Gemini will tag it, critique it, and connect it to projects.\n` +
    `• *Reminders*: Natural language dates like "in 3 hours", "tomorrow at 5 PM", "next Friday".\n` +
    `• *Forwarded content*: Simply forward a post here for summary/takeaways.\n\n` +
    `*Commands*:\n` +
    `• \`/projects\` - List all projects.\n` +
    `• \`/project <name>\` - View detail / create project.\n` +
    `• \`/project <name> | <description>\` - Create project with description.\n` +
    `• \`/ideas\` - List recent thoughts.\n` +
    `• \`/reminders\` - List active reminders.\n` +
    `• \`/search <keyword>\` - Search thoughts.`
  );
});

// /projects
bot.command('projects', (ctx) => {
  const list = getProjects();
  if (list.length === 0) {
    return replyHtml(ctx, '📂 *No projects found.* Use \`/project <name> | <description>\` to create one!');
  }

  let response = '📂 *Your Projects:*\n\n';
  list.forEach((p) => {
    response += `• *${p.name}* [_${p.status}_]\n  ${p.description || 'No description'}\n\n`;
  });
  replyHtml(ctx, response);
});

// /project <name> [| <description>]
bot.command('project', (ctx) => {
  const text = ctx.payload.trim();
  if (!text) {
    return replyHtml(ctx, 'Usage: \`/project <name>\` or \`/project <name> | <description>\`');
  }

  let name = text;
  let description = '';

  if (text.includes('|')) {
    const parts = text.split('|');
    name = parts[0].trim();
    description = parts[1].trim();
  }

  const existing = getProjectByName(name);
  if (existing) {
    return replyHtml(
      ctx,
      `📁 *Project Details:* **${existing.name}**\n` +
      `*Status:* \`${existing.status.toUpperCase()}\`\n` +
      `*Description:* _${existing.description || 'None'}_\n\n` +
      `*Notes & Log:*\n${existing.notes || '_No progress logged yet. Send text mentioning this project to log updates!_'}`
    );
  }

  saveProject(name, description || 'Created via command', 'active');
  replyHtml(ctx, `📁 *Project Created:* **${name}**\nYou can now send notes or ideas mentioning **${name}** and they will automatically group under this project.`);
});

// /ideas
bot.command('ideas', (ctx) => {
  const thoughts = getThoughts(10);
  if (thoughts.length === 0) {
    return replyHtml(ctx, '💡 *No ideas or thoughts recorded yet.* Just send me a message containing your thoughts!');
  }

  let response = '💡 *Your Recent Thoughts:*\n\n';
  thoughts.forEach((t) => {
    response += `• *[${t.category?.toUpperCase()}]* ${t.content.substring(0, 100)}${t.content.length > 100 ? '...' : ''}\n  _Tags: ${t.tags || 'none'} (${t.created_at})_\n\n`;
  });
  replyHtml(ctx, response);
});

// /reminders
bot.command('reminders', (ctx) => {
  const list = getPendingReminders();
  if (list.length === 0) {
    return replyHtml(ctx, '⏰ *No active reminders.*');
  }

  let response = '⏰ *Active Reminders:*\n\n';
  list.forEach((r) => {
    const time = new Date(r.remind_at).toLocaleString();
    response += `• [ID: ${r.id}] "${r.message}"\n  Scheduled at: _${time}_\n\n`;
  });
  response += `Use \`/cancel_reminder <ID>\` to cancel a reminder.`;
  replyHtml(ctx, response);
});

// /cancel_reminder <ID>
bot.command('cancel_reminder', (ctx) => {
  const arg = ctx.payload.trim();
  const id = parseInt(arg, 10);
  if (isNaN(id)) {
    return replyHtml(ctx, 'Usage: \`/cancel_reminder <ID>\`');
  }

  const success = cancelReminder(id);
  if (success) {
    replyHtml(ctx, `✅ Reminder #${id} cancelled successfully.`);
  } else {
    replyHtml(ctx, `❌ Could not find or cancel reminder #${id}.`);
  }
});

// /search <query>
bot.command('search', (ctx) => {
  const query = ctx.payload.trim();
  if (!query) {
    return replyHtml(ctx, 'Usage: \`/search <keyword>\`');
  }

  const results = searchThoughts(query);
  if (results.length === 0) {
    return replyHtml(ctx, `🔍 No thoughts found matching: *${query}*`);
  }

  let response = `🔍 *Search Results for "${query}":*\n\n`;
  results.slice(0, 10).forEach((t) => {
    response += `• *[${t.category?.toUpperCase()}]* ${t.content.substring(0, 120)}${t.content.length > 120 ? '...' : ''}\n  _Created: ${t.created_at}_\n\n`;
  });
  replyHtml(ctx, response);
});

// --- TEXT MESSAGE PROCESSING ---

bot.on('text', async (ctx) => {
  const msg = ctx.message as any;
  const text = msg.text.trim();
  const userId = ctx.from.id;
  const isForwarded = msg.forward_date !== undefined;

  // Let the user know the bot is thinking
  await ctx.sendChatAction('typing');

  try {
    // 1. Handle Forwarded Messages
    if (isForwarded) {
      let sourceName = 'Unknown source';
      if (msg.forward_from_chat) {
        sourceName = `Channel: ${msg.forward_from_chat.title || msg.forward_from_chat.username || 'unknown'}`;
      } else if (msg.forward_from) {
        sourceName = `User: ${msg.forward_from.first_name} (${msg.forward_from.username || ''})`;
      } else if (msg.forward_sender_name) {
        sourceName = `Sender: ${msg.forward_sender_name}`;
      }

      const summary = await summarizeForwarded(text, sourceName);
      
      // Save the summary as a thought
      saveThought(
        `Forwarded from ${sourceName}:\n\n${text}`,
        'forwarded,summary',
        'general',
        summary,
        'chat',
        sourceName
      );

      return replyHtml(ctx, `📥 *Forwarded Summary (${sourceName}):*\n\n${summary}`);
    }

    // 2. Classify Direct Messages using Gemini
    const analysis = await classifyMessage(text);

    // 3. Process reminders first
    if (analysis.isReminder || analysis.category === 'reminder') {
      const reminderText = analysis.extractedReminderText || text;
      const { cleanText, date } = parseReminderText(text);

      if (date) {
        createAndScheduleReminder(bot, userId, cleanText, date);
        return replyHtml(
          ctx,
          `⏰ *Reminder Scheduled!*\n\n` +
          `• *What:* ${cleanText}\n` +
          `• *When:* \`${date.toLocaleString()}\``
        );
      } else {
        return replyHtml(
          ctx,
          `⏰ I recognized this as a reminder request, but I couldn't parse the exact date/time from it.\n\n` +
          `Please specify a clearer time format like "in 15 minutes", "tomorrow at 3 PM", or "next Friday at 10 AM".`
        );
      }
    }

    // 4. Process project updates
    if (analysis.category === 'project_update') {
      const projName = analysis.projectName || analysis.title;
      let project = getProjectByName(projName);

      // Auto-create project if it doesn't exist
      if (!project) {
        saveProject(projName, 'Auto-created project from message update', 'active');
        project = getProjectByName(projName);
      }

      if (project) {
        // Append update to project notes
        const existingNotes = project.notes || '';
        const timestamp = new Date().toLocaleString();
        const updatedNotes = `${existingNotes}\n[${timestamp}] ${text}`.trim();
        updateProjectNotes(project.name, updatedNotes);

        // Generate feedback using current project notes as context
        const feedback = await generateFeedback(text, 'project_update', project.description + '\n' + project.notes);
        
        // Save thought
        saveThought(text, analysis.tags.join(','), 'project_update', feedback, 'direct', ctx.from.username || 'user');

        return replyHtml(
          ctx,
          `📁 *Project Update Logged!* to **${project.name}**\n\n` +
          `🧠 *Antigravity Feedback:*\n${feedback}`
        );
      }
    }

    // 5. Process general thoughts & ideas
    if (analysis.category === 'thought') {
      // Fetch some recent thoughts for context (e.g. connections)
      const recentThoughts = getThoughts(3);
      const recentContext = recentThoughts
        .map((t) => `- [Title: ${t.category}] ${t.content}`)
        .join('\n');

      const feedback = await generateFeedback(text, 'thought', recentContext);

      saveThought(
        text,
        analysis.tags.join(','),
        'thought',
        feedback,
        'direct',
        ctx.from.username || 'user'
      );

      return replyHtml(
        ctx,
        `💡 *Thought Analyzed:* **${analysis.title}**\n` +
        `🏷️ *Tags:* _${analysis.tags.join(', ') || 'none'}_\n\n` +
        `🧠 *Antigravity Analysis:*\n\n${feedback}`
      );
    }

    // 6. General text conversation
    const replyText = await generateFeedback(text, 'general');
    return replyHtml(ctx, replyText);

  } catch (error) {
    console.error('Error handling text message:', error);
    ctx.reply('⚠️ Sorry, I encountered an error while processing your message.');
  }
});

// Start bot
bot.launch().then(() => {
  console.log('🚀 Antigravity Telegram Bot is up and running!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
