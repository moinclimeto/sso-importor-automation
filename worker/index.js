import { Worker } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const queueName = 'ocr-queue';

// Key pooling
let apiKeys = [];
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('GEMINI_API_KEY') && value) {
    apiKeys.push(value.trim());
  }
}
if (!apiKeys.length) {
  console.warn('No GEMINI_API_KEY found in environment!');
}

console.log(`Worker started. Connecting to Redis at ${connection.host}:${connection.port}`);
console.log(`Listening for jobs on queue: ${queueName}`);

const worker = new Worker(
  queueName,
  async (job) => {
    const { base64, mimeType, prompt, outFileName, sNo } = job.data;
    
    if (!base64 || !prompt) {
      throw new Error('Invalid job data: missing base64 or prompt');
    }

    const apiKey = apiKeys[(sNo || Math.floor(Math.random() * 100)) % Math.max(1, apiKeys.length)];
    const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!genAI) {
      throw new Error('No API key available for extraction');
    }

    const defaultModels = [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-3.6-flash',
    ];
    
    const envModel = process.env.GEMINI_MODEL?.trim();
    const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    
    const modelNames = [
      ...new Set([...(envModel ? [envModel] : []), ...envCandidates, ...defaultModels]),
    ];

    let parsed = null;
    let lastError = null;

    console.log(`[Job ${job.id}] Started extraction for ${outFileName}`);

    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096),
          },
        });
        const result = await model.generateContent([
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ]);
        const text = result.response
          .text()
          .trim()
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        parsed = JSON.parse(text);
        console.log(`[Job ${job.id}] Success using model ${modelName}`);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[Job ${job.id}] Model ${modelName} failed: ${err?.message}`);
      }
    }

    if (!parsed) {
      throw new Error(lastError?.message || 'Gemini extraction failed for all models');
    }

    return { parsed };
  },
  { 
    connection,
    concurrency: parseInt(process.env.JOB_WORKER_CONCURRENCY) || (apiKeys.length > 0 ? apiKeys.length * 10 : 10)
  }
);

worker.on('completed', (job) => {
  console.log(`[Job ${job.id}] Completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[Job ${job?.id}] Failed with error: ${err.message}`);
});
