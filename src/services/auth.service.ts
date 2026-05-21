import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import crypto from 'crypto';
import { DynamoDBLib } from '../lib/dynamodb.lib';
import { createError } from '../middleware/asyncHandler';
import { now } from '../utils/index';
import type { User } from '../types/models';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? '';
const QUOTA_DEFAULT = 50 * 1024 * 1024 * 1024; // 50 GB

export interface LoginResult {
  token: {
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
  };
  user: User;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  bio?: string;
}

export class AuthService {
  private readonly cognito: CognitoIdentityProviderClient;
  constructor(private readonly dynamo: DynamoDBLib) {
    this.cognito = new CognitoIdentityProviderClient({ region: REGION });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private secretHash(username: string): string {
    if (!CLIENT_SECRET) return '';
    return crypto
      .createHmac('SHA256', CLIENT_SECRET)
      .update(username + CLIENT_ID)
      .digest('base64');
  }

  // ── signup ────────────────────────────────────────────────────────────────────

  async signup(input: SignupInput): Promise<{ user: User }> {
    const { username, email, password, first_name, last_name, bio } = input;

    if (!username || !email || !password || !first_name || !last_name) {
      throw createError(
        'username, email, password, first_name and last_name are required',
        400,
        'BAD_REQUEST',
      );
    }

    let createdSub: string | null = null;

    try {
      // 1. Cognito sign-up
      const signupRes = await this.cognito.send(
        new SignUpCommand({
          ClientId: CLIENT_ID,
          SecretHash: this.secretHash(username),
          Username: username,
          Password: password,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'given_name', Value: first_name },
            { Name: 'family_name', Value: last_name },
          ],
        }),
      );
      createdSub = signupRes.UserSub!;

      // 2. Auto-confirm + verify email
      await this.cognito.send(
        new AdminConfirmSignUpCommand({ UserPoolId: POOL_ID, Username: username }),
      );
      await this.cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: POOL_ID,
          Username: username,
          UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
        }),
      );

      // 3. Write DynamoDB profile
      const ts = now();
      const user: User = {
        id: createdSub!,
        email,
        name: `${first_name} ${last_name}`,
        storage_used_bytes: 0,
        storage_quota_bytes: QUOTA_DEFAULT,
        created_at: ts,
      };

      await this.dynamo.put({
        ...user,
        username,
        first_name,
        last_name,
        bio: bio ?? null,
        PK: `USER#${createdSub}`,
        SK: 'PROFILE',
        GSI1PK: `USERNAME#${username}`,
        GSI1SK: ts,
      });

      return { user };
    } catch (err: any) {
      // Rollback: delete Cognito user if anything failed after creation
      if (createdSub) {
        await this.cognito
          .send(new AdminDeleteUserCommand({ UserPoolId: POOL_ID, Username: username }))
          .catch(() => { });
      }
      // Surface validation errors from Cognito cleanly
      if (err.name === 'UsernameExistsException') {
        throw createError('Username already exists', 409, 'CONFLICT');
      }
      if (err.name === 'InvalidPasswordException') {
        throw createError(err.message, 400, 'INVALID_PASSWORD');
      }
      throw err;
    }
  }

  // ── login ─────────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      throw createError('username and password are required', 400, 'BAD_REQUEST');
    }

    let authResult;
    try {
      const res = await this.cognito.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH' as AuthFlowType,
          ClientId: CLIENT_ID,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            SECRET_HASH: this.secretHash(username),
          },
        }),
      );
      authResult = res.AuthenticationResult;
    } catch (err: any) {
      if (
        err.name === 'NotAuthorizedException' ||
        err.name === 'UserNotFoundException'
      ) {
        throw createError('Invalid username or password', 401, 'UNAUTHORIZED');
      }
      throw err;
    }

    if (!authResult?.AccessToken) {
      throw createError('Authentication failed', 401, 'UNAUTHORIZED');
    }

    // Resolve DynamoDB user from Cognito sub
    const cognitoUser = await this.cognito.send(
      new GetUserCommand({ AccessToken: authResult.AccessToken }),
    );
    const sub = cognitoUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
    if (!sub) throw createError('Could not resolve user identity', 401, 'UNAUTHORIZED');

    const user = await this.dynamo.get<User>(`USER#${sub}`, 'PROFILE');
    if (!user) throw createError('User profile not found', 404, 'NOT_FOUND');

    return {
      token: {
        accessToken: authResult.AccessToken,
        refreshToken: authResult.RefreshToken ?? '',
        idToken: authResult.IdToken ?? '',
        expiresIn: authResult.ExpiresIn ?? 3600,
      },
      user,
    };
  }

  // ── refreshToken ──────────────────────────────────────────────────────────────

  async refreshToken(refreshToken: string, usernameHint: string): Promise<RefreshResult> {
    if (!refreshToken) {
      throw createError('refreshToken is required', 400, 'BAD_REQUEST');
    }

    let result;
    try {
      const res = await this.cognito.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
            SECRET_HASH: this.secretHash(usernameHint),
          },
        }),
      );
      result = res.AuthenticationResult;
    } catch (err: any) {
      if (err.name === 'NotAuthorizedException') {
        throw createError('Refresh token expired or revoked', 401, 'UNAUTHORIZED');
      }
      throw err;
    }

    return {
      accessToken: result?.AccessToken ?? '',
      refreshToken: result?.RefreshToken ?? refreshToken,
      idToken: result?.IdToken ?? '',
      expiresIn: result?.ExpiresIn ?? 3600,
    };
  }

  // ── forgotPassword ────────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    if (!email) throw createError('email is required', 400, 'BAD_REQUEST');
    try {
      await this.cognito.send(
        new ForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: email,
          SecretHash: this.secretHash(email),
        }),
      );
    } catch (err: any) {
      // Don't leak whether account exists
      if (err.name === 'UserNotFoundException') return;
      throw err;
    }
  }

  // ── confirmPassword ───────────────────────────────────────────────────────────

  async confirmPassword(
    username: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    if (!username || !code || !newPassword) {
      throw createError('username, code and newPassword are required', 400, 'BAD_REQUEST');
    }
    try {
      await this.cognito.send(
        new ConfirmForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: username,
          ConfirmationCode: code,
          Password: newPassword,
          SecretHash: this.secretHash(username),
        }),
      );
    } catch (err: any) {
      if (err.name === 'CodeMismatchException') {
        throw createError('Invalid or expired reset code', 400, 'INVALID_CODE');
      }
      if (err.name === 'InvalidPasswordException') {
        throw createError(err.message, 400, 'INVALID_PASSWORD');
      }
      throw err;
    }
  }

  // ── setNewPassword (admin) ────────────────────────────────────────────────────

  async setNewPassword(email: string, newPassword: string): Promise<void> {
    if (!email || !newPassword) {
      throw createError('email and newPassword are required', 400, 'BAD_REQUEST');
    }
    await this.cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: POOL_ID,
        Username: email,
        Password: newPassword,
        Permanent: true,
      }),
    );
  }
}
