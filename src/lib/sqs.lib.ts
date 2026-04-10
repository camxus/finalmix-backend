import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

export class SQSLib {
  private readonly client: SQSClient;

  constructor() {
    this.client = new SQSClient({ region: REGION });
  }

  async send(queueUrl: string, body: unknown, dedupeId?: string): Promise<void> {
    await this.withRetry(() =>
      this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(body),
          ...(dedupeId ? { MessageDeduplicationId: dedupeId } : {}),
        })
      )
    );
  }

  async sendBatch(queueUrl: string, messages: { id: string; body: unknown }[]): Promise<void> {
    for (let i = 0; i < messages.length; i += 10) {
      const batch = messages.slice(i, i + 10);
      await this.withRetry(() =>
        this.client.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: batch.map(m => ({ Id: m.id, MessageBody: JSON.stringify(m.body) })),
          })
        )
      );
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const isTransient =
          err instanceof Error &&
          (err.message.includes('503') || err.message.includes('ThrottlingException'));
        if (!isTransient || i === attempts - 1) throw err;
        await new Promise(r => setTimeout(r, 100 * 2 ** i));
      }
    }
    throw new Error('unreachable');
  }
}
