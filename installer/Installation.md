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

Create an environment variable in ubuntu's .bashrc file:

```bash
export SPENDCRAFT_ROOT=/spendcraft/server
```

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
\connect spendcraft
CREATE extension tablefunc;
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
/etc/nginx/sites-enabled/spendcraft.conf -> $SPENDCRAFT_ROOT/nginx.conf
```

The installer requires sudo permission to create this link, run `nginx -t`, and
reload Nginx. A conflicting sites-enabled entry is never overwritten; resolve it
manually. Existing site files under other names are not removed, so review any
old SpendCraft site definitions to avoid duplicate host declarations. Validation
runs before backup/migrations, and Nginx is validated again and reloaded only after
the RESUME confirmation and application-process startup. An unsuccessful install
before that point does not reload Nginx. If initial validation fails, only a newly
created enabled link is removed; the shared file remains for inspection.

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

Create a file in your $SPENDCRAFT_ROOT/server folder named spendcraft-env:

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

In the installed spendcraft root folder (usually $SPENDCRAFT_ROOT/server/spendcraft) link spendcraft-env to .env:

```bash
cd $SPENDCRAFT_ROOT/server/spendcraft
ln -s $SPENDCRAFT_ROOT/server/spendcraft-env .env
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
./deploy.sh staging releases/<printed-release-directory>
```

After installing and accepting that release on staging, upload the same saved
package to production:

```bash
./deploy.sh production releases/<same-release-directory>
```

Deployment verifies checksums and does not rebuild or execute installation
remotely. The application's archive and saved installer template stay the same;
the wrapper is bound to the selected environment. Each build creates a new
package; existing accepted packages must not be edited. See
`docs/installer-environment-configuration.md` for artifact contents and safeguards.
