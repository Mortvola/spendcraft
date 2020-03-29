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
