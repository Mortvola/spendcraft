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

Create the config file

```bash
sudo nginx -t

sudo service nginx restart
```

### On the Mac

sudo nginx -s stop; sudo nginx

## Let's Encrypt certificates

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
