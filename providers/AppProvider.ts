import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import BalanceUpdater from './BalanceUpdater/BalanceUpdater';
import Plaid from './Plaid/Plaid';

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationContract) {
  }

  public register () {
    // Register the plaid binding.
    this.app.container.singleton('Plaid', () => {
      return new Plaid(this.app.config.get('plaid', {}))
    });

    // Register the balance updater binding.
    this.app.container.singleton('BalanceUpdater', () => {
      return new BalanceUpdater();
    })
  }

  public async boot () {
    // IoC container is ready
  }

  public async ready () {
    // App is ready

    // Importing the BalanceUpdater will instantiate an instance
    // which will start it running.
    import('@ioc:BalanceUpdater');
  }

  public async shutdown () {
    // Cleanup, since app is going down
  }
}
