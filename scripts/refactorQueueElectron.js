import fs from 'fs';

let content = fs.readFileSync('electron/ocrHandlers.js', 'utf8');

// Replace imports
content = content.replace(
  "import { GoogleGenerativeAI } from '@google/generative-ai';",
  "import { GoogleGenerativeAI } from '@google/generative-ai';\nimport { Queue, QueueEvents } from 'bullmq';"
);

// Add queue setup
const queueSetup = `
export function registerOcrHandlers() {
  let ocrQueue = null;
  let queueEvents = null;
  try {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };
    ocrQueue = new Queue('ocr-queue', { connection });
    queueEvents = new QueueEvents('ocr-queue', { connection });
  } catch (err) {
    console.warn('Could not connect to Redis for OCR queue. BullMQ will fail if invoked.', err);
  }

  registerOcrHandlersInternal(ocrQueue, queueEvents);
}

function registerOcrHandlersInternal(ocrQueue, queueEvents) {`;

content = content.replace('export function registerOcrHandlers() {', queueSetup);

// Wait, the end of `registerOcrHandlers()` needs an extra brace.
// Instead of replacing the whole thing, let me just add the arguments to `extractOneInvoice`
content = content.replace(
  'async function extractOneInvoice({',
  'async function extractOneInvoice({\n  ocrQueue,\n  queueEvents,\n'
);

// We must also pass ocrQueue and queueEvents into extractOneInvoice from runExtractQueue
content = content.replace(
  'extractFn: (args) => extractOneInvoice(args),',
  'extractFn: (args) => extractOneInvoice({ ...args, ocrQueue, queueEvents }),'
);

// Now the actual logic replacement
const oldLogicStr = `const genAI = new GoogleGenerativeAI(apiKey);
    const envModel = process.env.GEMINI_MODEL?.trim();
    const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const defaultModels = [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-2.0-flash',
    ];
    const modelNames = [
      ...new Set([...(envModel ? [envModel] : []), ...envCandidates, ...defaultModels]),
    ];
    const prompt = buildExtractionPrompt(invoiceType, financialYear);
    let parsed = null;
    let lastError = null;
    let usedModel = null;

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
          .replace(/\\\`\\\`\\\`json\\n?/g, '')
          .replace(/\\\`\\\`\\\`\\n?/g, '')
          .trim();
        parsed = JSON.parse(text);
        usedModel = modelName;
        break;
      } catch (err) {
        lastError = err;
        log.warn('Gemini model failed', { modelName, message: err?.message });
      }
    }

    if (!parsed) {
      log.error('Gemini extraction failed for all models', {
        fileName: outFileName,
        message: lastError?.message,
      });
      return {
        success: false,
        message: lastError?.message || 'Gemini extraction failed for all models.',
        fileName: outFileName,
        trackId: log.trackId,
      };
    }`;

const newLogicStr = `const prompt = buildExtractionPrompt(invoiceType, financialYear);
    let parsed = null;
    let lastError = null;
    let usedModel = 'gemini-worker';

    if (ocrQueue && queueEvents) {
      try {
        log.info('Adding extraction job to BullMQ', { outFileName });
        const job = await ocrQueue.add('extract', {
          base64,
          mimeType,
          prompt,
          outFileName,
          sNo
        });
        const result = await job.waitUntilFinished(queueEvents, 120000); // 2 min timeout
        parsed = result.parsed;
        log.success('BullMQ job completed successfully', { outFileName });
      } catch (err) {
        lastError = err;
        log.error('BullMQ job failed', { message: err?.message });
      }
    } else {
      log.info('BullMQ not configured, falling back to local Gemini processing', { outFileName });
      const genAI = new GoogleGenerativeAI(apiKey);
      const envModel = process.env.GEMINI_MODEL?.trim();
      const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '').split(',').map((m) => m.trim()).filter(Boolean);
      const defaultModels = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.0-flash'];
      const modelNames = [...new Set([...(envModel ? [envModel] : []), ...envCandidates, ...defaultModels])];

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
          const result = await model.generateContent([{ text: prompt }, { inlineData: { mimeType, data: base64 } }]);
          const text = result.response.text().trim().replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
          parsed = JSON.parse(text);
          usedModel = modelName;
          break;
        } catch (err) {
          lastError = err;
          log.warn('Gemini model failed', { modelName, message: err?.message });
        }
      }
    }

    if (!parsed) {
      log.error('Gemini extraction failed', {
        fileName: outFileName,
        message: lastError?.message,
      });
      return {
        success: false,
        message: lastError?.message || 'Gemini extraction failed.',
        fileName: outFileName,
        trackId: log.trackId,
      };
    }`;

// Since regex replace might be tricky with special chars, let's use a simpler index replace
const replaceIndex = content.indexOf('const genAI = new GoogleGenerativeAI(apiKey);');
const endIndex = content.indexOf('const qrResult = await qrPromise;');

if (replaceIndex !== -1 && endIndex !== -1) {
    content = content.slice(0, replaceIndex) + newLogicStr + '\n\n    ' + content.slice(endIndex);
}

// Ensure registerOcrHandlers closes
content = content + '\n';

fs.writeFileSync('electron/ocrHandlers.js', content);
console.log('electron/ocrHandlers.js updated successfully.');
