// Global mock setup — runs before all test files

jest.mock('../lib/dynamodb.lib', () => ({
  DynamoDBLib: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    batchWrite: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../lib/s3.lib', () => ({
  S3Lib: jest.fn().mockImplementation(() => ({
    presignPut: jest.fn().mockResolvedValue('https://s3.example.com/presigned-put'),
    presignGet: jest.fn().mockResolvedValue('https://s3.example.com/presigned-get'),
    getStream: jest.fn().mockResolvedValue(Buffer.from('RIFF_fake_audio_data')),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../lib/sqs.lib', () => ({
  SQSLib: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue(undefined),
    sendBatch: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../lib/cognito.lib', () => ({
  CognitoLib: jest.fn().mockImplementation(() => ({
    verifyToken: jest.fn().mockResolvedValue({ sub: 'user-test-1', email: 'test@test.com' }),
  })),
}));

jest.mock('../lib/nemotron.lib', () => ({
  NemotronLib: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue(
      JSON.stringify({
        instrument_type: 'kick drum',
        category: 'drums',
        subcategory: 'kick',
        confidence: 0.95,
        tags: ['punchy', 'sub-heavy'],
        detected_bpm: 128,
        detected_key: null,
      })
    ),
    parseJSON: jest.fn().mockImplementation((raw: string) => JSON.parse(raw)),
  })),
}));

// Shared fixtures
export const mockUser = {
  id: 'user-test-1',
  email: 'test@test.com',
  name: 'Test User',
  storage_used_bytes: 0,
  storage_quota_bytes: 50 * 1024 * 1024 * 1024,
  created_at: '2026-01-01T00:00:00.000Z',
};

export const mockProject = {
  id: 'project-test-1',
  owner_id: 'user-test-1',
  title: 'Test Project',
  status: 'wip',
  visibility: 'private',
  genre: [],
  custom_tags: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

export const mockTrack = {
  id: 'track-test-1',
  project_id: 'project-test-1',
  name: 'Kick',
  color: '#5a8ff0',
  order_index: 0,
  is_placeholder: false,
  ai_status: 'pending' as const,
  user_tags: [],
  current_commit_id: 'commit-test-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

export const mockCommit = {
  id: 'commit-test-1',
  asset_id: 'track-test-1',
  asset_type: 'track' as const,
  version_number: 1,
  file_url: 'https://s3.example.com/track.wav',
  file_key: 'users/user-test-1/projects/project-test-1/tracks/track-test-1/commit-test-1.wav',
  file_size_bytes: 10_000_000,
  duration_seconds: 222,
  format: 'wav',
  sample_rate: 48000,
  channels: 2,
  uploaded_by: 'user-test-1',
  created_at: '2026-01-01T00:00:00.000Z',
};
