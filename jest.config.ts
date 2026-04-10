import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  rootDir: '.',

  testMatch: ['**/__tests__/**/*.test.ts'],

  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },

  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/sqs/**/*.ts',
    'src/middleware/**/*.ts',
    '!**/*.d.ts',
  ],

  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
};

export default config;