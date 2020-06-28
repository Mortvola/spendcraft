'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

class RedirectUnauthed {
    /**
     * @param {object} ctx
     * @param {Request} ctx.request
     * @param {Function} next
     */
    // eslint-disable-next-line class-methods-use-this
    async handle({ response, auth }, next) {
        // call next to advance the request
        if (!auth.user) {
            return response.redirect('/');
        }

        await next();
    }
}

module.exports = RedirectUnauthed
