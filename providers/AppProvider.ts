import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import Plaid from './Plaid/Plaid';

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationContract) {
  }

  public register () {
    // Register your own bindings
    this.app.container.singleton('Plaid', () => {
      return new Plaid(this.app.config.get('plaid', {}))
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
