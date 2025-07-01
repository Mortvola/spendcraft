import { test } from '@japa/runner'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import Plaid, { WebhookVerificationKeyGetResponse } from '#providers/Plaid/Plaid'
import app from '@adonisjs/core/services/app';
import { DateTime } from 'luxon';
import { sha256 } from 'js-sha256';
import { v4 as uuidv4 } from 'uuid';

test.group('Webhooks', () => {
  test('webhook test', )
    .run(async ({ client, cleanup }) => {
      const alg = 'RS256'
      const keypair = await generateKeyPair(alg, { modulusLength: 2048 })
      const publicJWK = await exportJWK(keypair.publicKey)
      publicJWK.alg = alg
      publicJWK.kid = uuidv4()
      publicJWK.use = 'sig'

      const createdAt = DateTime.now()
  
      class PlaidFake extends Plaid {
        async getWebhookVerificationKey(_keyId: string): Promise<WebhookVerificationKeyGetResponse> {
          return {
            key: {
              ...publicJWK,
              alg: publicJWK.alg ?? '',
              crv: publicJWK.crv ?? '',
              kid: publicJWK.kid ?? '',
              kty: publicJWK.kty ?? '',
              use: publicJWK.use ?? '',
              x: publicJWK.x ?? '',
              y: publicJWK.y ?? '',
              created_at: createdAt.toUnixInteger(),
              expired_at: null,
            },
            request_id: 'requestId'
          }
        }
      }

      app.container.swap(Plaid, () => {
        return new PlaidFake(app.config.get('plaid'))
      })

      cleanup(() => {
        app.container.restore(Plaid)
      })

      const webhookBody = { webhook_type: 'TEST' };
      const issuedAt = DateTime.now().toUnixInteger()

      const verficationToken = await new SignJWT({
        iat: issuedAt,
        request_body_sha256: sha256(JSON.stringify(webhookBody))
      })
        .setProtectedHeader({ alg, kid: publicJWK.kid })
        .setIssuedAt(issuedAt)
        .sign(keypair.privateKey)

      const response = await client.post('/wh')
        .json(webhookBody)
        .header('Plaid-Verification', verficationToken)

      response.assertStatus(204)
    })
  })
