import ApplePushNotifications from './ApplePushNotifications';
import Plaid from './Plaid/Plaid';
import { ApplicationService } from "@adonisjs/core/types";

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationService) {
  }

  public register () {
    // Register the plaid binding.
    this.app.container.singleton('Plaid', () => {
      return new Plaid(this.app.config.get('plaid', {}))
    });

    // Register the Apple Push Notifications binding.
    this.app.container.singleton('ApplePushNotifications', () => {
      return new ApplePushNotifications();
    })
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
