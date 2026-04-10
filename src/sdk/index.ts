import { DynamoDBLib } from '../lib/dynamodb.lib';
import { S3Lib } from '../lib/s3.lib';
import { SQSLib } from '../lib/sqs.lib';
import { NemotronLib } from '../lib/nemotron.lib';
import { TracksService } from '../services/tracks.service';
import { StemsService } from '../services/stems.service';
import { ProjectsService } from '../services/projects.service';
import { SharesService } from '../services/shares.service';
import { CommentsService } from '../services/comments.service';
import { DownloadService } from '../services/download.service';
import { UploadService } from '../services/upload.service';
import { AIService } from '../services/ai.service';
import { UsersService } from '../services/users.service';

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
    users: new UsersService(dynamo),
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
