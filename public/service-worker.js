self.addEventListener('install', (event) => {
  self.skipWaiting();

  // event.waitUntil(
  //   // caching etc
  // );
});

const setOrClearBadge = async (data: any) => {
  if (navigator.setAppBadge) {
    if (data.unassignedCount > 0) {
      await navigator.setAppBadge(data.unassignedCount);
    }
    else {
      await navigator.clearAppBadge();
    }
  }
}

// Listen to `push` notification event. Define the text to be displayed
// and show the notification.
self.addEventListener('push', (event) => {
  const data = event.data.json();

  // Show the new notifications
  event.waitUntil(
    setOrClearBadge(data)
      .then(() => (
        self.registration.getNotifications()
      ))
      .then((notifications) => {
        for (let i = 0; i < notifications.length; i += 1) {
          notifications[i].close();
        }

        return self.registration.showNotification(data.title, {
          body: data.body,
          icon: '/logo2.png',
          tag: 'new-transactions',
          renotify: true,
        })
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
      })
      .then((clientList) => {
        // eslint-disable-next-line no-restricted-syntax
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/home');
        }
      }),
  );
});

// Listen to  `pushsubscriptionchange` event which is fired when
// subscription expires. Subscribe again and register the new subscription
// in the server by sending a POST request with endpoint. Real world
// application would probably use also user identification.
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Subscription expired');
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        console.log('Subscribed after expiration', subscription.endpoint);
        return fetch('register', {
          method: 'post',
          headers: {
            'Content-type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }),
  );
});
