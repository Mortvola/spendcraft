self.addEventListener('install', (event) => {
  self.skipWaiting();

  // event.waitUntil(
  //   // caching etc
  // );
});

// Listen to `push` notification event. Define the text to be displayed
// and show the notification.
self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('SpendCraft', {
    body: 'There are unassigned transactions!!',
  }));
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
