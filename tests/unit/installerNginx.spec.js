import { test } from '@japa/runner'
import process from 'node:process'
import { mkdtemp, writeFile, readFile, rm, lstat, readlink, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test.group('Installer Nginx configuration (temporary files, mocked sudo/Nginx)', (group) => {
  let root
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft-nginx-')))
    return () => rm(root, { recursive: true, force: true })
  })
  async function run(target, status = 0) {
    const source = await readFile('installer/install.sh0', 'utf8')
    const start = source.indexOf('configure_nginx() {')
    const end = source.indexOf('\nensure_app_key() {', start)
    const template = join(root, 'template.conf')
    await writeFile(template, await readFile('installer/nginx.conf'))
    return spawnSync('bash', ['-c', `set -e
set -o pipefail
sudo() {
  local args=()
  local arg
  for arg in "$@"; do
    if [ "$arg" = /etc/nginx/sites-enabled/spendcraft.conf ]; then args+=("$TEST_SITE"); else args+=("$arg"); fi
  done
  case "\${args[0]}" in
    nginx) printf 'NGINX_TEST\\n'; return ${status} ;;
    systemctl) printf 'UNEXPECTED_SERVICE_CHANGE\\n'; return 99 ;;
    test|ln|rm|readlink) command "\${args[@]}" ;;
    *) return 98 ;;
  esac
}
${source.slice(start, end)}
configure_nginx "$TEST_ROOT" "$TEST_TEMPLATE" "$TEST_TARGET"
`], {
      encoding: 'utf8', env: { PATH: process.env.PATH, TEST_ROOT: root, TEST_TEMPLATE: template,
        TEST_SITE: join(root, 'enabled-site'), TEST_TARGET: target },
    })
  }
  test('creates the shared configuration and enabled symlink for the selected environment')
    .with(['production', 'staging']).run(async ({ assert }, target) => {
      const result = await run(target)
      assert.equal(result.status, 0, result.stderr)
      const contents = await readFile(join(root, 'nginx.conf'), 'utf8')
      assert.include(contents, target === 'staging' ? 'server_name staging.spendcraft.app;' : 'server_name spendcraft.app;')
      assert.include(contents, 'listen 80;')
      assert.include(contents, '$request_uri')
      assert.include(contents, '$proxy_add_x_forwarded_for')
      assert.notInclude(contents, 'listen 443')
      assert.isTrue((await lstat(join(root, 'enabled-site'))).isSymbolicLink())
      assert.equal(await readlink(join(root, 'enabled-site')), join(root, 'nginx.conf'))
      assert.include(result.stdout, 'NGINX_TEST')
      assert.notInclude(result.stdout, 'UNEXPECTED_SERVICE_CHANGE')
    })
  test('preserves existing configuration and Certbot modifications byte-for-byte, including repeated installation', async ({ assert }) => {
    const original = '# modified by Certbot\nserver { listen 443 ssl; server_name existing.example; }\n'
    await writeFile(join(root, 'nginx.conf'), original)
    for (let index = 0; index < 2; index++) {
      const result = await run('staging')
      assert.equal(result.status, 0, result.stderr)
      assert.equal(await readFile(join(root, 'nginx.conf'), 'utf8'), original)
    }
  })
  test('refuses a conflicting enabled entry without replacing it').with(['file', 'link'])
    .run(async ({ assert }, kind) => {
      const path = join(root, 'enabled-site')
      if (kind === 'file') await writeFile(path, 'existing site')
      else await symlink(join(root, 'other-config'), path)
      const result = await run('production')
      assert.equal(result.status, 1)
      assert.include(result.stderr, 'does not link to')
      assert.notInclude(result.stdout, 'NGINX_TEST')
      if (kind === 'file') assert.equal(await readFile(path, 'utf8'), 'existing site')
      else assert.equal(await readlink(path), join(root, 'other-config'))
    })
  test('failed Nginx validation removes only a newly created enabled link', async ({ assert }) => {
    const result = await run('staging', 1)
    assert.equal(result.status, 1)
    await assert.rejects(() => lstat(join(root, 'enabled-site')))
    assert.include(await readFile(join(root, 'nginx.conf'), 'utf8'), 'server_name staging.spendcraft.app;')
    assert.include(result.stderr, 'validation failed')
  })
  test('failed validation preserves an existing matching link', async ({ assert }) => {
    await symlink(join(root, 'nginx.conf'), join(root, 'enabled-site'))
    const result = await run('production', 1)
    assert.equal(result.status, 1)
    assert.isTrue((await lstat(join(root, 'enabled-site'))).isSymbolicLink())
  })
  test('invalid target never creates a configuration or enabled link', async ({ assert }) => {
    const result = await run('other')
    assert.notEqual(result.status, 0)
    await assert.rejects(() => lstat(join(root, 'nginx.conf')))
    await assert.rejects(() => lstat(join(root, 'enabled-site')))
  })
  test('installer packages the template, validates before migrations and reloads only after application startup', async ({ assert }) => {
    assert.include(await readFile('adonisrc.ts', 'utf8'), "pattern: 'installer/nginx.conf'")
    const source = await readFile('installer/install.sh0', 'utf8')
    const call = source.indexOf('\nconfigure_nginx "$PWD" "$PWD/$APP_NEW/installer/nginx.conf" "$INSTALL_TARGET"')
    assert.isAbove(call, source.indexOf('\nnode scripts/configureInstallerEnv.mjs'))
    assert.isBelow(call, source.indexOf('\nbash "$SPENDCRAFT_ROOT/$APP_NEW/installer/backup.sh"'))
    const reload = source.indexOf('\nsudo systemctl reload nginx')
    assert.isAbove(reload, source.indexOf('\nconfirm_deployment RESUME'))
    assert.isAbove(reload, source.indexOf('\npm2 save'))
    assert.include(source.slice(source.indexOf('\npm2 save'), reload), 'sudo nginx -t')
  })
})
