module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'], // Изменено с __tests__ на tests
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/types/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^../src/(.*)$': '<rootDir>/src/$1'
  }
};