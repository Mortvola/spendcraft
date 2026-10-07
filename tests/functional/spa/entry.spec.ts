import { test } from '@japa/runner'

test.group('Anonymous SPA entry', () => {
  test('renders the current application shell').with(['/', '/signin', '/signup'])
    .run(async ({ client, assert }, path) => {
      const response = await client.get(path)
      response.assertStatus(200)
      assert.include(response.header('content-type'), 'text/html')
      const html = response.text()
      assert.include(html, '<title>SpendCraft</title>')
      assert.match(html, /<div\s+class="app"\s+data-props=/)
      assert.match(html, /<script\b[^>]*type="module"/)
      assert.notInclude(html, 'welcome.css')
      assert.notInclude(html, '/welcome.js')
    })
})
