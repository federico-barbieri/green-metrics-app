module.exports = {
    testDir: './tests/e2e',
    timeout: 30000,
    use: {
      baseURL: 'http://localhost:3000',
      headless: true,
      screenshot: 'only-on-failure'
    }
  }