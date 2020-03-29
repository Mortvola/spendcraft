const { hooks } = require('@adonisjs/ignitor')

hooks.after.providersBooted(() => {
  const Env = use('Env')
  const View = use('View')
  
  View.global('env', (name) => {
          let value = Env.get(name);
          
          if (value === null) {
              value = "";
          }
          
          return value;
      });
  
})
