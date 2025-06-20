/**
 * Config source: https://git.io/JfefZ
 *
 * Feel free to let us know via PR, if you find something broken in this config
 * file.
 */

import proxyAddr from 'proxy-addr'
import env from '#start/env'
import { defineConfig } from "@adonisjs/core/http";

/*
|--------------------------------------------------------------------------
| Application secret key
|--------------------------------------------------------------------------
|
| The secret to encrypt and sign different values in your application.
| Make sure to keep the `APP_KEY` as an environment variable and secure.
|
| Note: Changing the application key for an existing app will make all
| the cookies invalid and also the existing encrypted data will not
| be decrypted.
|
*/
export const appKey: string = env.get('APP_KEY')

/*
|--------------------------------------------------------------------------
| Http server configuration
|--------------------------------------------------------------------------
|
| The configuration for the HTTP(s) server. Make sure to go through all
| the config properties to make keep server secure.
|
*/
export const http = defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Allow method spoofing
  |--------------------------------------------------------------------------
  |
  | Method spoofing enables defining custom HTTP methods using a query string
  | `_method`. This is usually required when you are making traditional
  | form requests and wants to use HTTP verbs like `PUT`, `DELETE` and
  | so on.
  |
  */
  allowMethodSpoofing: false,

  /*
  |--------------------------------------------------------------------------
  | Subdomain offset
  |--------------------------------------------------------------------------
  */
  subdomainOffset: 2,

  /*
  |--------------------------------------------------------------------------
  | Request Ids
  |--------------------------------------------------------------------------
  |
  | Setting this value to `true` will generate a unique request id for each
  | HTTP request and set it as `x-request-id` header.
  |
  */
  generateRequestId: false,

  /*
  |--------------------------------------------------------------------------
  | Trusting proxy servers
  |--------------------------------------------------------------------------
  |
  | Define the proxy servers that AdonisJs must trust for reading `X-Forwarded`
  | headers.
  |
  */
  trustProxy: proxyAddr.compile('loopback'),

  /*
  |--------------------------------------------------------------------------
  | Generating Etag
  |--------------------------------------------------------------------------
  |
  | Whether or not to generate an etag for every response.
  |
  */
  etag: false,

  /*
  |--------------------------------------------------------------------------
  | JSONP Callback
  |--------------------------------------------------------------------------
  */
  jsonpCallbackName: 'callback',

  /*
  |--------------------------------------------------------------------------
  | Cookie settings
  |--------------------------------------------------------------------------
  */
  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
  },

  /*
  |--------------------------------------------------------------------------
  | Force content negotiation to JSON
  |--------------------------------------------------------------------------
  |
  | The internals of the framework relies on the content negotiation to
  | detect the best possible response type for a given HTTP request.
  |
  | However, it is a very common these days that API servers always wants to
  | make response in JSON regardless of the existence of the `Accept` header.
  |
  | By setting `forceContentNegotiationToJSON = true`, you negotiate with the
  | server in advance to always return JSON without relying on the client
  | to set the header explicitly.
  |
  */
  // forceContentNegotiationTo: 'application/json'
})

/*
|--------------------------------------------------------------------------
| Validator
|--------------------------------------------------------------------------
|
| Configure the global configuration for the validator. Here's the reference
| to the default config https://git.io/JT0WE
|
*/
// export const validator: ValidatorConfig = {
// }
