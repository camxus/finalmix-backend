import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';
const REGION = process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'eu-west-1';

const JWKS_URI = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}/.well-known/jwks.json`;
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`;

const client = jwksClient({ jwksUri: JWKS_URI, cache: true, rateLimit: true });

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key?.getPublicKey());
  });
}

export interface CognitoPayload {
  sub: string;
  email: string;
  name?: string;
  'cognito:username'?: string;
}

export class CognitoLib {
  async verifyToken(token: string): Promise<CognitoPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        { issuer: ISSUER, algorithms: ['RS256'] },
        (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded as CognitoPayload);
        }
      );
    });
  }
}
