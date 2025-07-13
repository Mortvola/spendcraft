import { symbols, errors } from '@adonisjs/auth'
import { AuthClientResponse, GuardContract } from '@adonisjs/auth/types'
import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { createPrivateKey, createPublicKey } from 'crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime, Duration } from 'luxon'
import { v4 as uuidv4 } from 'uuid';
import redis from '@adonisjs/redis/services/main';

/**
 * The bridge between the User provider and the
 * Guard
 */
export interface JwtGuardUser<RealUser> {
  /**
   * Returns the unique ID of the user
   */
  // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
  getId(): string | number | BigInt

  /**
   * Returns the original user object
   */
  getOriginal(): RealUser
}

/**
 * The interface for the UserProvider accepted by the
 * JWT guard.
 */
export interface JwtUserProviderContract<RealUser> {
  /**
   * A property the guard implementation can use to infer
   * the data type of the actual user (aka RealUser)
   */
  [symbols.PROVIDER_REAL_USER]: RealUser

  /**
   * Create a user object that acts as an adapter between
   * the guard and real user value.
   */
  createUserForGuard(user: RealUser): Promise<JwtGuardUser<RealUser>>

  /**
   * Find a user by their id.
   */
  // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
  findById(identifier: string | number | BigInt): Promise<JwtGuardUser<RealUser> | null>
}

export interface TokenDuration {
  days?: number,
  hours?: number,
  minutes?: number,
}

export interface JwtGuardOptions {
  publicKey: string
  privateKey: string
  issuer: string
  audience: string
  jwtDefaultExpire: TokenDuration
  refreshTokenDefaultExpire: TokenDuration
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type JWTCustomPayloadData = {
  userId: number,
  [key: string]: unknown
}

type JWTCustomPayload = JWTPayload & {
  data?: JWTCustomPayloadData
}

export class JwtGuard<UserProvider extends JwtUserProviderContract<unknown>>
  implements GuardContract<UserProvider[typeof symbols.PROVIDER_REAL_USER]>
{
  /**
   * A list of events and their types emitted by
   * the guard.
   */
  declare [symbols.GUARD_KNOWN_EVENTS]: object

  /**
   * A unique name for the guard driver
   */
  driverName = 'jwt'

  /**
   * A flag to know if the authentication was an attempt
   * during the current HTTP request
   */
  authenticationAttempted = false

  /**
   * A boolean to know if the current request has
   * been authenticated
   */
  isAuthenticated = false

  /**
   * Reference to the currently authenticated user
   */
  user?: UserProvider[typeof symbols.PROVIDER_REAL_USER]

  #ctx: HttpContext
  #userProvider: UserProvider
  #options: JwtGuardOptions

  constructor(ctx: HttpContext, userProvider: UserProvider, options: JwtGuardOptions) {
    this.#ctx = ctx
    this.#userProvider = userProvider
    this.#options = options;
  }

  /**
   * Generate a JWT token for a given user.
   */
  async generate(user: UserProvider[typeof symbols.PROVIDER_REAL_USER]) {
    const providerUser = await this.#userProvider.createUserForGuard(user)

    const accessTokenBuilder = new SignJWT({ data: { userId: providerUser.getId() }})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()

    accessTokenBuilder.setIssuer(this.#options.issuer)
    accessTokenBuilder.setAudience(this.#options.audience)

    const jwtDuration = `${Duration.fromObject(this.#options.jwtDefaultExpire).toMillis() / 1000 / 60}m`
    accessTokenBuilder.setExpirationTime(jwtDuration)

    const secret = createPrivateKey(this.#options.privateKey)
    const accessToken = await accessTokenBuilder.sign(secret)
    const refreshToken = uuidv4()

    // Store the user id 
    const redisKey = `jwt_refresh:${refreshToken}`
    redis.set(redisKey, providerUser.getId().toString())

    // const expiresIn = this.#options.refreshTokenDefaultExpire
    // const milliseconds = typeof expiresIn === "string" ? string.toMs(expiresIn) : expiresIn;
    
    const expiresAt = DateTime.now().plus(Duration.fromObject(this.#options.refreshTokenDefaultExpire));
    redis.expireat(redisKey, expiresAt.toUnixInteger())

    return {
      accessToken,
      refreshToken,
    }
  }

  async loginViaRefreshToken(refreshToken: string) {
    const redisKey = `jwt_refresh:${refreshToken}`
    const userId = await redis.get(redisKey)

    if (!userId) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    const user = await this.#userProvider.findById(userId)

    if (!user) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    // Remove refresh token from store
    redis.del(redisKey)

    return this.generate(user.getOriginal())
  }

  revoke(refreshToken: string) {
    const redisKey = `jwt_refresh:${refreshToken}`

    // Remove refresh token from store
    redis.del(redisKey)
  }

  /**
   * Authenticate the current HTTP request and return
   * the user instance if there is a valid JWT token
   * or throw an exception
   */
  async authenticate(): Promise<UserProvider[typeof symbols.PROVIDER_REAL_USER]> {
    /**
     * Avoid re-authentication when it has been done already
     * for the given request
     */
    if (this.authenticationAttempted) {
      return this.getUserOrFail()
    }
    this.authenticationAttempted = true

    /**
     * Ensure the auth header exists
     */
    const authHeader = this.#ctx.request.header('authorization')
    if (!authHeader) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    /**
     * Split the header value and read the token from it
     */
    const [, token] = authHeader.split('Bearer ')
    if (!token) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    /**
     * Verify token
     */
    const secret = createPublicKey(this.#options.publicKey)
    const { payload } = await jwtVerify(token, secret, {
            issuer: 'spendcraft', // this.#options.issuer,
            audience: 'spendcraft', // this.#options.audience,
        })
    
    const { data, exp }: JWTCustomPayload = payload;

    if (!data || !data.userId || (exp && exp < Math.floor(DateTime.now().toSeconds()))) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    /**
     * Fetch the user by user ID and save a reference to it
     */
    const providerUser = await this.#userProvider.findById(data?.userId)
    if (!providerUser) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    this.user = providerUser.getOriginal()
    return this.getUserOrFail()
  }

  /**
   * Same as authenticate, but does not throw an exception
   */
  async check(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(error) {
      return false
    }
  }

  /**
   * Returns the authenticated user or throws an error
   */
  getUserOrFail(): UserProvider[typeof symbols.PROVIDER_REAL_USER] {
    if (!this.user) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
        guardDriverName: this.driverName,
      })
    }

    return this.user
  }

  /**
   * This method is called by Japa during testing when "loginAs"
   * method is used to login the user.
   */
  async authenticateAsClient(
    user: UserProvider[typeof symbols.PROVIDER_REAL_USER]
  ): Promise<AuthClientResponse> {
    const token = await this.generate(user)
    return {
      headers: {
        authorization: `Bearer ${token.accessToken}`,
      },
    }
  }
}
