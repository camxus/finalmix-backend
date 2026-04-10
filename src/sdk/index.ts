import { DynamoDBLib } from '../lib/dynamodb.lib.js';
import { S3Lib } from '../lib/s3.lib.js';
import { SQSLib } from '../lib/sqs.lib.js';
import { NemotronLib } from '../lib/nemotron.lib.js';
import { TracksService } from '../services/tracks.service.js';
import { StemsService } from '../services/stems.service.js';
import { ProjectsService } from '../services/projects.service.js';
import { SharesService } from '../services/shares.service.js';
import { CommentsService } from '../services/comments.service.js';
import { DownloadService } from '../services/download.service.js';
import { UploadService } from '../services/upload.service.js';
import { AIService } from '../services/ai.service.js';

// Singleton libs (stateless, safe to share across requests)
const dynamo = new DynamoDBLib();
const sqs = new SQSLib();
const nemotron = new NemotronLib();

export function buildSDK(userId: string) {
  const s3 = new S3Lib(userId); // userId is context-specific

  return {
    // libs
    dynamo,
    s3,
    sqs,
    nemotron,

    // services
    projects: new ProjectsService(dynamo),
    tracks: new TracksService(dynamo, sqs),
    stems: new StemsService(dynamo),
    shares: new SharesService(dynamo),
    comments: new CommentsService(dynamo),
    upload: new UploadService(dynamo, s3, sqs),
    download: new DownloadService(dynamo, s3),
    ai: new AIService(dynamo, sqs, nemotron),
  };
}

export type SDK = ReturnType<typeof buildSDK>;
