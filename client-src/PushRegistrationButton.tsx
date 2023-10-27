import Http from '@mortvola/http';
import React from 'react';
import { Button } from 'react-bootstrap';

type PropsType = {
  url: string,
  className?: string,
}

const PushRegistrationButton: React.FC<PropsType> = ({
  url,
  className,
}) => {
  const [subscription, setSubscription] = React.useState<PushSubscription | null>(null);
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
      if ('serviceWorker' in navigator) {
        // When the Service Worker is ready, enable the UI (button),
        // and see if we already have a subscription set up.
        const reg = await navigator.serviceWorker.ready;

        setRegistration(reg);

        if (reg.pushManager) {
          const sub = await reg.pushManager.getSubscription();

          setSubscription(sub);
        }
      }
    })();
  }, []);

  React.useEffect(() => {
    const element = document.getElementById('subscribe');

    if (element) {
      const listener = async () => {
        if (registration) {
          if (subscription) {
            subscription.unsubscribe();
            setSubscription(null);
            console.log('unsubscribed')
          }
          else {
          // Get the server's public key
            const response = await Http.get<string>('/vapidPublicKey');

            if (response.ok) {
              const vapidPublicKey = await response.body();
              // Chrome doesn't accept the base64-encoded (string) vapidPublicKey yet
              // urlBase64ToUint8Array() is defined in /tools.js
              const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

              const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey,
              });

              setSubscription(sub);

              await Http.post(url, sub);

              if (sub) {
                console.log('subscribed');
              }
              else {
                console.log('not subscribed');
              }
            }
          }
        }
      }

      element.addEventListener('click', listener)

      return () => {
        if (element) {
          element.removeEventListener('click', listener);
        }
      }
    }

    return undefined;
  }, [registration, subscription, url]);

  return (
    <Button className={className} id="subscribe" disabled={(registration?.pushManager ?? null) === null}>
      {
        subscription === null
          ? 'Enable Notifications'
          : 'Disable Notifications'
      }
    </Button>
  )
}

export default PushRegistrationButton;
