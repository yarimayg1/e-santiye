module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  collectCoverageFrom: [
    'server.js',
    '!node_modules/**'
  ]
};
