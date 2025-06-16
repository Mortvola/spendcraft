/*
|--------------------------------------------------------------------------
| Preloaded File
|--------------------------------------------------------------------------
|
| Any code written inside this file will be executed during the application
| boot.
|
*/
import emitter from '@adonisjs/core/services/emitter'
import db from '@adonisjs/lucid/services/db'

emitter.on('db:query', db.prettyPrint);
