import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { SQSLib } from '../lib/sqs.lib.js';
import { NemotronLib } from '../lib/nemotron.lib.js';
import { AIService } from '../services/ai.service.js';
import { now } from '../utils/index.js';
import type { AIAnalysisJobPayload } from '../types/models.js';

const dynamo = new DynamoDBLib();
const sqs = new SQSLib();
const nemotron = new NemotronLib();
const aiService = new AIService(dynamo, sqs, nemotron);

interface SQSEvent {
  Records: Array<{ body: string; receiptHandle?: string }>;
}

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    let payload: AIAnalysisJobPayload;
    try {
      payload = JSON.parse(record.body) as AIAnalysisJobPayload;
    } catch {
      console.error('[aiAnalysisWorker] Invalid JSON in SQS record:', record.body);
      continue;
    }

    const { trackId, commitId, projectId } = payload;

    // Mark as processing
    await dynamo.update({
      pk: `TRACK#${trackId}`,
      sk: `PROJECT#${projectId}`,
      updates: { ai_status: 'processing', updated_at: now() },
    }).catch(err => console.warn('[aiAnalysisWorker] Failed to set processing status', err));

    try {
      await aiService.runAnalysis(trackId, commitId, projectId);
      console.log(`[aiAnalysisWorker] ✓ ${trackId} analysed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aiAnalysisWorker] ✗ ${trackId} failed: ${msg}`);
      await dynamo.update({
        pk: `TRACK#${trackId}`,
        sk: `PROJECT#${projectId}`,
        updates: { ai_status: 'failed', ai_error: msg, updated_at: now() },
      }).catch(() => {});
    }
  }
}
