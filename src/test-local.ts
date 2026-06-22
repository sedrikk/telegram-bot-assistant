import { initDb, saveThought, getThoughts, saveProject, getProjects } from './db';
import { parseReminderText } from './reminders';
import { classifyMessage } from './llm';

async function runLocalTests() {
  console.log('🧪 Starting local verification tests...');

  // 1. Test DB Initialization
  console.log('\n--- 1. Testing SQLite Database ---');
  try {
    initDb();
    console.log('✅ DB initialized successfully.');

    // Save test project
    const pId = saveProject('Soil Moisture App', 'A mobile app to track soil moisture', 'planning');
    console.log(`✅ Saved test project. ID: ${pId}`);

    // Query projects
    const projects = getProjects();
    console.log('Projects list:', projects);

    // Save test thought
    const tId = saveThought(
      'I should use a Bluetooth low energy module for the moisture sensor.',
      'hardware,iot',
      'thought',
      'This is a good idea. BLE will save battery.',
      'direct',
      'tester'
    );
    console.log(`✅ Saved test thought. ID: ${tId}`);

    // Query thoughts
    const thoughts = getThoughts(5);
    console.log('Thoughts list:', thoughts);
  } catch (error) {
    console.error('❌ Database test failed:', error);
  }

  // 2. Test Chrono Date Parsing
  console.log('\n--- 2. Testing Natural Language Date Parsing ---');
  const testPhrases = [
    'remind me to check the oven in 5 minutes',
    'remind me tomorrow at 9 AM to review the project draft',
    'remind me next Monday at 6 PM to submit the report',
    'clean my desk at 8pm',
    'go to gym'
  ];

  testPhrases.forEach((phrase) => {
    const { cleanText, date } = parseReminderText(phrase);
    console.log(`Input: "${phrase}"`);
    console.log(`  -> Clean text: "${cleanText}"`);
    console.log(`  -> Parsed date: ${date ? date.toLocaleString() : 'NULL (No date detected)'}`);
  });

  // 3. Test LLM integration (if API key is present)
  console.log('\n--- 3. Testing Gemini API Integration ---');
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('API Key detected. Testing classifyMessage with: "remind me to call Dave tomorrow at 3pm"...');
      const classification = await classifyMessage('remind me to call Dave tomorrow at 3pm');
      console.log('Classification Result:', classification);

      console.log('\nTesting classifyMessage with a generic thought: "I should build a solar powered calculator using recycled cardboard"...');
      const thoughtClass = await classifyMessage('I should build a solar powered calculator using recycled cardboard');
      console.log('Classification Result:', thoughtClass);
    } catch (e) {
      console.error('❌ Gemini API test failed:', e);
    }
  } else {
    console.log('ℹ️ Skipping Gemini API integration tests as GEMINI_API_KEY is not defined.');
  }

  console.log('\n🏁 Local verification tests completed.');
}

runLocalTests();
