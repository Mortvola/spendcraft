'use strict'

class WebhookController {
    static post({ request }) {
        console.log(JSON.stringify(request.body, null, 4));
    }
}

module.exports = WebhookController;
