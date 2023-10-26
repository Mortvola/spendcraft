import Http from '@mortvola/http';
import React from 'react';
import { Button } from 'react-bootstrap';

type PropsType = {
  url: string,
  children?: React.ReactNode,
  className?: string,
}

const PushRegistrationButton: React.FC<PropsType> = ({
  url,
  children,
  className,
}) => {
  const [subscribed, setSubscribed] = React.useState<boolean>(false);
  const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null);

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  React.useEffect(() => {
    (async () => {
      navigator.serviceWorker.register('service-worker.js');

      // When the Service Worker is ready, enable the UI (button),
      // and see if we already have a subscription set up.
      const reg = await navigator.serviceWorker.ready;

      setRegistration(reg);

      console.log('service worker registered');
      // subscriptionButton.removeAttribute('disabled');

      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        console.log('Already subscribed', subscription.endpoint);
        setSubscribed(true);
      }
      else {
        console.log('Not already subscribed');
        setSubscribed(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    const element = document.getElementById('subscribe');

    if (element) {
      element.addEventListener('click', async () => {
        if (!subscribed && registration) {
        // Get the server's public key
          const response = await Http.get<string>('/vapidPublicKey');

          if (response.ok) {
            const vapidPublicKey = await response.body();
            // Chrome doesn't accept the base64-encoded (string) vapidPublicKey yet
            // urlBase64ToUint8Array() is defined in /tools.js
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
            // Subscribe the user
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey,
            });

            console.log('Subscribed', subscription.endpoint);

            await Http.post(url, subscription);
          }
        // setSubscribeButton();
        }
      })
    }
  }, [registration, subscribed]);

  return (
    <Button className={className} id="subscribe">
      {children}
    </Button>
  )
}

export default PushRegistrationButton;
