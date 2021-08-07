import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import plaid from 'plaid';

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationContract) {
  }

  public register () {
    // Register your own bindings
    this.app.container.singleton('Plaid', () => {
      // const Config = this.app.container.use('Adonis/Core/Config');
      // return new plaid.Client({
      //   clientID: Config.get('plaid.clientId'),
      //   secret: Config.get('plaid.secret'),
      //   env: plaid.environments[Config.get('plaid.environment')],
      //   options: {},
      // })
    });
  }

  public async boot () {
    // IoC container is ready
  }

  public async ready () {
    // App is ready
  }

  public async shutdown () {
    // Cleanup, since app is going down
  }
}
