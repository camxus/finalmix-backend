import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterFramework: ['<rootDir>/__tests__/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  collectCoverageFrom: [
    'services/**/*.ts',
    'sqs/**/*.ts',
    'middleware/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThresholds: { global: { lines: 80, functions: 80 } },
};

export default config;
