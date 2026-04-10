import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE ?? 'mixvault-dev';
const REGION = process.env.AWS_REGION ?? 'eu-west-1';

function buildClient(): DynamoDBDocumentClient {
  const opts: ConstructorParameters<typeof DynamoDBClient>[0] = { region: REGION };
  if (process.env.DYNAMODB_ENDPOINT) {
    opts.endpoint = process.env.DYNAMODB_ENDPOINT;
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(opts), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

type BaseQueryParams = {
  limit?: number;
  scanForward?: boolean;
  filterExpression?: string;
  filterValues?: Record<string, unknown>;
};

type QueryParams =
  | (BaseQueryParams & {
    pk: string;
    skPrefix?: string;
    skEquals?: string;

    indexName?: undefined;
    gsiPk?: never;
    gsiPkField?: never;
    gsiSk?: never;
    gsiSkField?: never;
  })
  | (BaseQueryParams & {
    indexName: string;
    gsiPk: string;
    gsiPkField?: string;
    gsiSk?: string;
    gsiSkField?: string;

    pk?: never;
    skPrefix?: never;
    skEquals?: never;
  });

export interface UpdateParams {
  pk: string;
  sk: string;
  updates: Record<string, unknown>;
}

export class DynamoDBLib {
  private readonly client: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(table: string = TABLE) {
    this.client = buildClient();
    this.table = table;
  }

  async get<T>(pk: string, sk: string): Promise<T | null> {
    const result = await this.withRetry(() =>
      this.client.send(new GetCommand({ TableName: this.table, Key: { PK: pk, SK: sk } }))
    );
    return (result.Item as T) ?? null;
  }

  async put(item: Record<string, unknown>): Promise<void> {
    await this.withRetry(() =>
      this.client.send(new PutCommand({ TableName: this.table, Item: item }))
    );
  }

  async update({ pk, sk, updates }: UpdateParams): Promise<void> {
    const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (!entries.length) return;

    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const parts: string[] = [];

    entries.forEach(([k, v]) => {
      const nameKey = `#${k}`;
      const valKey = `:${k}`;
      names[nameKey] = k;
      values[valKey] = v;
      parts.push(`${nameKey} = ${valKey}`);
    });

    await this.withRetry(() =>
      this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${parts.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
      )
    );
  }

  async delete(pk: string, sk: string): Promise<void> {
    await this.withRetry(() =>
      this.client.send(new DeleteCommand({ TableName: this.table, Key: { PK: pk, SK: sk } }))
    );
  }

  async query<T>(params: QueryParams): Promise<T[]> {
    const input: QueryCommandInput = { TableName: this.table };

    if (params.indexName) {
      input.IndexName = params.indexName;
      input.KeyConditionExpression = `${params.gsiPkField ?? 'GSI1PK'} = :pk`;
      input.ExpressionAttributeValues = { ':pk': params.gsiPk };
      if (params.gsiSk) {
        input.KeyConditionExpression += ` AND begins_with(${params.gsiSkField ?? 'GSI1SK'}, :sk)`;
        (input.ExpressionAttributeValues as Record<string, unknown>)[':sk'] = params.gsiSk;
      }
    } else {
      input.KeyConditionExpression = 'PK = :pk';
      input.ExpressionAttributeValues = { ':pk': params.pk };
      if (params.skPrefix) {
        input.KeyConditionExpression += ' AND begins_with(SK, :sk)';
        (input.ExpressionAttributeValues as Record<string, unknown>)[':sk'] = params.skPrefix;
      } else if (params.skEquals) {
        input.KeyConditionExpression += ' AND SK = :sk';
        (input.ExpressionAttributeValues as Record<string, unknown>)[':sk'] = params.skEquals;
      }
    }

    if (params.filterExpression) {
      input.FilterExpression = params.filterExpression;
      Object.assign(input.ExpressionAttributeValues!, params.filterValues ?? {});
    }

    if (params.limit) input.Limit = params.limit;
    if (params.scanForward !== undefined) input.ScanIndexForward = params.scanForward;

    const result = await this.withRetry(() => this.client.send(new QueryCommand(input)));
    return (result.Items as T[]) ?? [];
  }

  async batchWrite(puts: Record<string, unknown>[], deletes?: { pk: string; sk: string }[]): Promise<void> {
    const requests: any[] = [
      ...puts.map(item => ({ PutRequest: { Item: item } })),
      ...(deletes ?? []).map(({ pk, sk }) => ({ DeleteRequest: { Key: { PK: pk, SK: sk } } })),
    ];

    for (let i = 0; i < requests.length; i += 25) {
      await this.withRetry(() =>
        this.client.send(
          new BatchWriteCommand({ RequestItems: { [this.table]: requests.slice(i, i + 25) } })
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
          (err.name === 'ProvisionedThroughputExceededException' ||
            err.name === 'RequestLimitExceeded' ||
            err.message.includes('503'));
        if (!isTransient || i === attempts - 1) throw err;
        await new Promise(r => setTimeout(r, 100 * 2 ** i));
      }
    }
    throw new Error('unreachable');
  }
}
