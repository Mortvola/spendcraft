import ApplePushNotifications from './ApplePushNotifications/index.js';
import Plaid from './Plaid/Plaid.js';
import { ApplicationService } from "@adonisjs/core/types";

export default class AppProvider {
	public static needsApplication = true

  constructor (protected app: ApplicationService) {
  }

  public register () {
    // Register the plaid binding.
    this.app.container.singleton(Plaid, () => {
      return new Plaid(this.app.config.get('plaid', {}))
    });

    this.app.container.alias('plaid', Plaid)

    // Register the Apple Push Notifications binding.
    this.app.container.singleton(ApplePushNotifications, () => {
      return new ApplePushNotifications();
    })

    this.app.container.alias('apn', ApplePushNotifications)
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
