## Postgres

sudo apt install postgresql-<Version>

See https://www.postgresql.org/download/linux/ubuntu/ if ubuntu version does not have desired version of Postgres.

CREATE USER ubuntu;
CREATE DATABASE spendcraft WITH OWNER ubuntu;
GRANT ALL ON SCHEMA public TO ubuntu;

\connect spendcraft
CREATE extension tablefunc;

## nvm

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

nvm list-remote --lts

nvm install --default <version>

## Redis

sudo apt-get install redis

sudo systemctl enable redis-server

sudo service redis-server start

## PM2

npm install pm2 -g

pm2 update

pm2 start server.js --time

pm2 startup

## nginx

sudo apt install nginx

<create config file>

sudo nginx -t

sudo service nginx restart

### On the Mac

sudo nginx -s stop; sudo nginx

## Let's Encrypt certificates

## node-gyp

npm install -g node-gyp
sudo apt install make g++ libpq-dev

## App set up

<setup .env file with database configuration>

ln -s .env-sandbox .env

node ace migration:run
