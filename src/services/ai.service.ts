import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { SQSLib } from '../lib/sqs.lib.js';
import { NemotronLib } from '../lib/nemotron.lib.js';
import { now } from '../utils/index.js';
import { createError } from '../middleware/asyncHandler.js';
import type { Track, TrackAIData } from '../types/models.js';

const AI_QUEUE = process.env.SQS_AI_ANALYSIS_QUEUE_URL ?? '';

export class AIService {
  constructor(
    private readonly dynamo: DynamoDBLib,
    private readonly sqs: SQSLib,
    private readonly nemotron: NemotronLib,
  ) {}

  async getTrackAI(projectId: string, trackId: string): Promise<{
    ai_status: Track['ai_status'];
    ai_data?: TrackAIData;
    ai_error?: string;
  }> {
    const track = await this.dynamo.get<Track>(`TRACK#${trackId}`, `PROJECT#${projectId}`);
    if (!track) throw createError('Track not found', 404, 'NOT_FOUND');
    return { ai_status: track.ai_status, ai_data: track.ai_data, ai_error: track.ai_error };
  }

  async reanalyse(projectId: string, trackId: string): Promise<void> {
    const track = await this.dynamo.get<Track>(`TRACK#${trackId}`, `PROJECT#${projectId}`);
    if (!track) throw createError('Track not found', 404, 'NOT_FOUND');
    if (!track.current_commit_id) throw createError('Track has no uploaded file', 422, 'NO_COMMITS');

    await this.dynamo.update({
      pk: `TRACK#${trackId}`,
      sk: `PROJECT#${projectId}`,
      updates: { ai_status: 'pending', ai_error: null, updated_at: now() },
    });

    if (AI_QUEUE) {
      await this.sqs.send(
        AI_QUEUE,
        { trackId, commitId: track.current_commit_id, projectId },
        `reanalyse-${trackId}-${Date.now()}`
      );
    }
  }

  async suggestStems(projectId: string): Promise<{ suggestions: { stemName: string; trackIds: string[] }[] }> {
    const tracks = await this.dynamo.query<Track>({
      indexName: 'GSI2',
      gsiPk: projectId,
      gsiPkField: 'GSI2PK',
    });

    const analysed = tracks.filter(t => t.ai_data);
    if (!analysed.length) {
      throw createError('No tracks with AI analysis yet. Wait for analysis to complete.', 422, 'NO_AI_DATA');
    }

    const summary = analysed.map(t => ({
      id: t.id,
      name: t.name,
      category: t.ai_data!.category,
      subcategory: t.ai_data!.subcategory,
      tags: t.ai_data!.tags,
    }));

    const prompt = `You are a professional mixing engineer assistant.
Given these tracks from a mixing session, suggest how to group them into stems.
Return ONLY a JSON object with this exact shape, no markdown, no explanation:
{
  "suggestions": [
    { "stemName": "Drums", "trackIds": ["id1", "id2"] },
    { "stemName": "Vocals", "trackIds": ["id3"] }
  ]
}

Tracks:
${JSON.stringify(summary, null, 2)}

Rules:
- Group by musical role, not just AI category
- Stem names should be short and descriptive (1-2 words)
- Every track must appear in exactly one stem
- Do not create stems with a single track unless there is no natural grouping`;

    const raw = await this.nemotron.complete(prompt);
    const parsed = this.nemotron.parseJSON<{ suggestions: { stemName: string; trackIds: string[] }[] }>(raw);

    // Validate all trackIds are real
    const validIds = new Set(tracks.map(t => t.id));
    for (const s of parsed.suggestions) {
      s.trackIds = s.trackIds.filter(id => validIds.has(id));
    }

    return parsed;
  }

  // Called directly by the SQS worker — exposed here so it can be tested independently
  async runAnalysis(trackId: string, commitId: string, projectId: string): Promise<TrackAIData> {
    const track = await this.dynamo.get<Track>(`TRACK#${trackId}`, `PROJECT#${projectId}`);
    if (!track) throw new Error(`Track ${trackId} not found`);

    const prompt = `You are an audio analysis assistant for a professional mixing engineer.
Analyse this audio track and return ONLY a JSON object — no markdown, no preamble.

Track name: "${track.name}"
Project context: project ID ${projectId}

Return this exact JSON shape:
{
  "instrument_type": "string describing the instrument",
  "category": "drums" | "vocals" | "instruments" | "fx",
  "subcategory": "optional string e.g. kick, snare, lead vocal, pad, bass guitar",
  "confidence": 0.0 to 1.0,
  "tags": ["array", "of", "descriptive", "sound", "tags"],
  "detected_bpm": null or number,
  "detected_key": null or string e.g. "C# minor"
}

Infer from the track name and common mixing conventions. Be specific.`;

    const raw = await this.nemotron.complete(prompt);
    const aiData = this.nemotron.parseJSON<TrackAIData>(raw);
    aiData.analysed_at = now();

    await this.dynamo.update({
      pk: `TRACK#${trackId}`,
      sk: `PROJECT#${projectId}`,
      updates: {
        ai_status: 'complete',
        ai_data: aiData,
        ai_error: null,
        updated_at: now(),
      },
    });

    // Propagate BPM/key to the AudioCommit record
    if (aiData.detected_bpm || aiData.detected_key) {
      await this.dynamo.update({
        pk: `ASSET#${trackId}`,
        sk: `COMMIT#${commitId}`,
        updates: {
          detected_bpm: aiData.detected_bpm,
          detected_key: aiData.detected_key,
        },
      });
    }

    return aiData;
  }
}
