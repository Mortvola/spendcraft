import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import plaid from 'App/Plaid/Plaid';
import { ClientConfigs, environments } from 'plaid';

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationContract) {
  }

  public register () {
    // Register your own bindings
    this.app.container.singleton('Plaid', () => {
      const Config = this.app.container.use('Adonis/Core/Config');

      let secret = '';
      const env = Config.get('plaid.environment');
      if (env === 'sandbox') {
        secret = Config.get('plaid.sandboxSecret');
      }
      else if (env === 'development') {
        secret = Config.get('plaid.developmentSecret');
      }
      else if (env === 'production') {
        secret = Config.get('plaid.productionSecret');
      }

      const config: ClientConfigs = {
        clientID: Config.get('plaid.clientId'),
        secret,
        env: environments[env],
        options: {
          version: '2020-09-14',
        },
      };

      return new plaid(config)
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
