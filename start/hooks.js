const { hooks } = require('@adonisjs/ignitor')

hooks.after.providersBooted(() => {
    const Env = use('Env')
    const View = use('View')
    const Exception = use('Exception')
  
    View.global('env', (name) => {
            let value = Env.get(name);
              
            if (value === null) {
                value = "";
            }
              
            return value;
        });

    const Validator = use('Validator')
    const Database = use('Database')

    // Empty validation method
    Validator.extend('empty', async (data, field, message, args, get) => {
        const value = get(data, field)
        if (!value) {
            /**
             * skip validation if value is not defined. `required` rule
             * should take care of it.
            */
            return
        }

        const [table, column] = args
        console.log (`table: ${table}, column: ${column}, value: ${value}`)
        let exists = await Database.select (Database.raw("EXISTS (SELECT 1 FROM ?? WHERE ?? = ?) AS exists", [table, column, value]));

        if (exists[0].exists) {
            throw message
        }
    });

    // UniqueWithin validation method
    Validator.extend('uniqueWithin', async (data, field, message, args, get) => {
        const value = get(data, field)
        if (!value) {
            /**
             * skip validation if value is not defined. `required` rule
             * should take care of it.
            */
            return
        }

        const [table, column, otherColumn, otherValue, ignoreColumn, ignoreValue] = args
        
        let query = Database.table(table).where(column, value).where(otherColumn, otherValue);
        
        if (ignoreColumn && ignoreValue) {
            query.where(ignoreColumn, '!=', ignoreValue);
        }
        
        const row = await query.first();

        if (row) {
            throw message
        }
    });

    Validator.extend('zeroSum', async (data, field, message, args, get) => {
        const value = get(data, field)
        if (!value) {
            /**
             * skip validation if value is not defined. `required` rule
             * should take care of it.
            */
            return
        }

        const [property] = args

        let sum = 0;
        for (let v of value) {
            sum += v[property];
        }
        
        if (sum !== 0) {
            throw message
        }
    });

  class ErrorTag extends View.engine.BaseTag {
    //
      get tagName () {
          return 'error'
        }

      get isBlock () {
          return true
        }

      compile (compiler, lexer, buffer, { body, childs, lineno }) {
          const compiledStatement = this._compileStatement(lexer, 'auth.user', lineno).toStatement()

          /**
           * Open if tag
           */
          buffer.writeLine(`if (${compiledStatement}) {`)
          buffer.indent()

          /**
           * Re-parse all childs via compiler.
           */
          childs.forEach((child) => compiler.parseLine(child))

          /**
           * Close the if tag
           */
          buffer.dedent()
          buffer.writeLine('}')
        }

      run () {}
  }

  View.tag(new ErrorTag())
})
