import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { S3Lib } from '../lib/s3.lib.js';
import { now } from '../utils/index.js';
import type { WaveformJobPayload } from '../types/models.js';

const dynamo = new DynamoDBLib();

interface SQSEvent {
  Records: Array<{ body: string }>;
}

// Generates a simplified peak array by sampling the raw audio buffer.
// In production this would decode WAV/FLAC via ffmpeg or a WASM decoder.
// Here we produce a deterministic pseudo-waveform from the byte distribution.
function extractPeaks(buffer: Buffer, numPeaks = 200): number[] {
  const step = Math.max(1, Math.floor(buffer.length / numPeaks));
  const peaks: number[] = [];
  for (let i = 0; i < numPeaks; i++) {
    const offset = i * step;
    const slice = buffer.slice(offset, offset + step);
    const max = slice.reduce((m, b) => Math.max(m, b), 0);
    peaks.push(+(max / 255).toFixed(3));
  }
  return peaks;
}

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    let payload: WaveformJobPayload;
    try {
      payload = JSON.parse(record.body) as WaveformJobPayload;
    } catch {
      console.error('[waveformWorker] Invalid JSON:', record.body);
      continue;
    }

    const { commitId, fileKey, assetId } = payload;
    const s3 = new S3Lib('worker');

    try {
      const buffer = await s3.getStream(fileKey);
      const peaks = extractPeaks(buffer);

      await dynamo.update({
        pk: `ASSET#${assetId}`,
        sk: `COMMIT#${commitId}`,
        updates: { waveform_data: peaks, updated_at: now() },
      });

      console.log(`[waveformWorker] ✓ ${commitId} — ${peaks.length} peaks extracted`);
    } catch (err) {
      console.error(`[waveformWorker] ✗ ${commitId}:`, err instanceof Error ? err.message : err);
    }
  }
}
