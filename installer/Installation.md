## Server Configuration

Setup an AWS instance with two disks. One disk will be the boot disk. The other disk will be the data disk.

You may need to partition the data disk. Assuming the data disk is nvme1n1 then:

```bash
sudo mkfs.ext4 /dev/nvme1n1
```

Create a mount point for the data disk and mount the drive at that mount point.

```bash
sudo mount /dev/nvme1n1 /spendcraft/
```

Create a server folder on the newly mounted disk and change the owner and group to ubuntu.

```bash
sudo chown ubuntu:ubuntu server
```

Add the drive to /etc/fstab by getting the UUID and adding it to /etc/fstab

```bash
sudo blkid /dev/nvme1n1
sudo nano /etc/fstab
```

### Authoritative server environment

Run only the block for the server being configured. Stop on any error. These one-time commands create a root-owned directory and a new root-owned mode-0644 data file; noclobber refuses to overwrite an existing file or symlink. Do not place secrets in this file.

On staging:

```bash
sudo test ! -L /etc/spendcraft &&
sudo install -d -o root -g root -m 0755 /etc/spendcraft &&
sudo sh -c 'set -C; umask 022; cat > /etc/spendcraft/environment' <<'EOF'
SPENDCRAFT_ENV=staging
SPENDCRAFT_ROOT=/spendcraft_staging/server
EOF
```

On production:

```bash
sudo test ! -L /etc/spendcraft &&
sudo install -d -o root -g root -m 0755 /etc/spendcraft &&
sudo sh -c 'set -C; umask 022; cat > /etc/spendcraft/environment' <<'EOF'
SPENDCRAFT_ENV=production
SPENDCRAFT_ROOT=/spendcraft-prod/server
EOF
```

Use exactly these two unquoted `KEY=value` settings, once each, in either order. Blank lines, comments, whitespace around `=`, quotes, unknown keys and shell substitutions are rejected. Roots must be absolute simple paths using letters, digits, underscore, slash, dot and hyphen. The file must be root-owned, readable and non-executable, with mode 400/440/444/600/640/644; `/etc/spendcraft` must be a real root-owned directory with mode 500/550/555/700/750/755. Neither may be a symlink. Standard setup is directory 0755 and file 0644. Keep the existing server root directory in place.

### Login-shell exports

Read-only inspection on October 25, 2026 found `/bin/bash` for ubuntu on both servers, `.profile` present, and neither `.bash_profile` nor `.bash_login`. Bash therefore uses `.profile`. If either higher-priority file is added later, ensure it invokes `.profile` or put the snippet in the selected login file. Do not execute `/etc/spendcraft/environment` itself. Non-login shells inherit exported values; they do not read `.profile` themselves.

When applying this setup, remove older hardcoded SPENDCRAFT_ENV/SPENDCRAFT_ROOT assignments from the user's shell startup files. Append the following snippet at the end of `~/.profile` (after its existing `.bashrc` inclusion), so `/etc/spendcraft/environment` remains the authoritative source. No actual profile file was changed by this implementation task.

<!-- spendcraft-profile-start -->
```sh
if [ -r /etc/spendcraft/environment ]; then
  while IFS='=' read -r key value; do
    case "$key=$value" in
      SPENDCRAFT_ENV=staging|SPENDCRAFT_ENV=production|SPENDCRAFT_ROOT=/*)
        export "$key=$value"
        ;;
      *)
        printf 'Invalid SpendCraft environment setting: %s\n' "$key" >&2
        ;;
    esac
  done < /etc/spendcraft/environment
else
  printf 'Cannot read /etc/spendcraft/environment\n' >&2
fi
```
<!-- spendcraft-profile-end -->

This convenience snippet reports invalid entries; duplicate valid keys use the last value. The installer performs the full validation independently.

The installer does not depend on this snippet or inherited variables. Run it without arguments: `./install.sh`. It independently parses the same fixed data file before prompting, extracting or changing anything; arguments are rejected. No server-identity check is performed.

## Postgres

Install postgres:

```bash
sudo apt install postgresql-<Version>
```

See https://www.postgresql.org/download/linux/ubuntu/ if ubuntu version does not have desired version of Postgres.

Stop the postgres service so we can move the data files to the data disk:

```bash
sudo systemctl stop postgresql
sudo systemctl status postgresql
```

```bash
cd /spendcraft_staging
sudo mkdir -p postgresql/<Version>/staging/
sudo chown -R postgres:postgres postgresql/<Version>/staging
```

Move the database files to the data disk:

```bash
sudo rsync -av /var/lib/postgresql/<Version>/main/ /spendcraft_staging/postgresql/<Version>/staging/
```

Edit the postgres config file and set the new location of the data files:

```bash
sudo vi /etc/postgresql/<Version>/main/postgresql.conf
```

Restart the postgres service:

```bash
sudo systemctl start postgresql
sudo systemctl status postgresql
```

Create a new postgres user and database:

```
sudo -u postgres psql
```

```
CREATE USER ubuntu;
CREATE DATABASE spendcraft WITH OWNER ubuntu;
GRANT ALL ON SCHEMA public TO ubuntu;
```

Connect to the spendcraft database and install the tablefunc extension:

```
sudo -u postgres psql -d spendcraft -v ON_ERROR_STOP=1 \
  -c 'CREATE EXTENSION IF NOT EXISTS tablefunc WITH SCHEMA public;'
```

Verify the extension was installed:

```bash
sudo -u postgres psql -d spendcraft \
  -c "SELECT to_regprocedure('public.crosstab(text,text)');"
```

## nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

```bash
nvm list-remote --lts
nvm install --default <version>
```

You will also need to create an .npmrc file in $SPENDCRAFT_ROOT which contains the token that allows download of some @mortvola packages. The file should contain the following lines with <token> replaced with the actual token.

```bash
@mortvola:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<token>
```

## Redis

Install redis:

```bash
sudo apt install redis
sudo systemctl enable redis-server
sudo service redis-server start
```

If you run into issues consult this web page:

https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-linux/


## PM2

Install PM2 globally:

```bash
npm install pm2 -g
pm2 update
```

```bash
pm2 start server.js --time
pm2 startup
```

Configure PM2 to restart after a system reboot by issueing this commmands and following their instructions.
```bash
# 1. Generate the startup script (Copy and paste the output line this command generates)
pm2 startup ubuntu

# 2. Freeze your current process list so it persists on boot
pm2 save
```

## nginx

```bash
sudo apt install nginx
```

The installer packages `installer/nginx.conf` as an initial HTTP-only site. It
creates `$SPENDCRAFT_ROOT/nginx.conf` only when no file exists there. For a staging
installation it substitutes `staging.spendcraft.app` for `spendcraft.app` in the
new file. Existing configurations are preserved, including Certbot changes.

Nginx references the shared configuration through:

```text
/etc/nginx/sites-enabled/spendcraft.app -> $SPENDCRAFT_ROOT/nginx.conf
```

The installer requires sudo permission to create this link, run `nginx -t`, and
reload Nginx. A conflicting sites-enabled entry is never overwritten; resolve it
manually. Existing site files under other names are not removed, so review any
old SpendCraft site definitions to avoid duplicate host declarations. Validation
runs before backup/migrations, and Nginx is validated again and reloaded only after
the RESUME confirmation and application-process startup. An unsuccessful install
before that point does not reload Nginx. If initial validation fails, only a newly
created enabled link is removed; the shared file remains for inspection.

Mistyped `DEPLOY` or `RESUME` confirmations prompt again. Enter `ABORT` or close
standard input to stop while preserving maintenance state.

If installation stops after database preparation and the release swap, rerun the
same generated `install.sh` without arguments. The installer verifies its SHA-256,
the installed build identity, and live/saved PM2 state using the existing durable
maintenance record. It returns to `RESUME` if writers are still fenced, or finishes
the remaining steps if PM2 restoration already succeeded. It does not repeat the
backup, migrations, seeders or release swap. The prompts do not replace readiness
review or automatically disable external maintenance.

Automatic continuation is unavailable for earlier interruptions, incomplete
process restoration, different installers/builds, or maintenance records created
by older installers without resume identity. Preserve the record and establish
database/filesystem safety before manual recovery; do not delete the record or
rerun migrations merely to bypass it.

Ensure DNS points to the intended server and HTTP port 80 is accessible before
using Certbot. The installer does not request certificates, add TLS configuration,
or change firewalls. Run Certbot separately after installation for the selected
hostname. Subsequent deployments preserve the shared file instead of replacing
certificate settings with the initial template.

### On the Mac

sudo nginx -s stop; sudo nginx

## Let's Encrypt certificates

Install certbot using snap:

```bash
sudo apt update
sudo apt install snapd -y
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
```

Verify the installation and verify the nginx plugin is installed:

```bash
certbot --version
sudo certbot plugins
```

After the Spendcraft install script completes successfully the first time, install the certificate from Certbot:

```bash
sudo certbot --nginx -d staging.spendcraft.app
```

## node-gyp

```bash
npm install -g node-gyp
sudo apt install make g++ libpq-dev
```

## App set up

Create the application environment file at `$SPENDCRAFT_ROOT/spendcraft-env`:

```
APP_NAME=SpendCraft
HOST=localhost
PORT=3334
NODE_ENV=production
APP_URL=<insert URL here>
CACHE_VIEWS=false

DB_CONNECTION=pg
PG_HOST=localhost
PG_PORT=5433
PG_USER=ubuntu
PG_DB_NAME=spendcraft
```

In the installed spendcraft root folder (usually `$SPENDCRAFT_ROOT/spendcraft`) link spendcraft-env to .env:

```bash
cd "$SPENDCRAFT_ROOT/spendcraft"
ln -s "$SPENDCRAFT_ROOT/spendcraft-env" .env
```

Run the migrations to create the tables:

```bash
node ace migration:run
```

## Unzip

sudo apt install unzip


## Promote the same build from staging to production

Build once locally with `./build.sh`. Save the unique `releases/release-*`
directory it prints. Upload it to staging with:

```bash
./deploy.sh releases/<printed-release-directory> staging
```

After installing and accepting that release on staging, upload the same saved
package to production:

```bash
./deploy.sh releases/<same-release-directory> production
```

Deployment verifies checksums and does not rebuild or execute installation
remotely. The application's archive and saved installer template stay the same;
the wrapper is bound to the selected environment. Each build creates a new
package; existing accepted packages must not be edited. See
`docs/installer-environment-configuration.md` for artifact contents and safeguards.
