import {
  InMemoryWebStorage,
  UserManager,
  WebStorageStateStore,
} from 'oidc-client-ts';

function requiredEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}.`);
  }
  return value;
}

const authority = requiredEnv('VITE_COGNITO_AUTHORITY');
const cognitoDomain = requiredEnv('VITE_COGNITO_DOMAIN').replace(/\/+$/, '');
const clientId = requiredEnv('VITE_COGNITO_CLIENT_ID');
const redirectUri = requiredEnv('VITE_REDIRECT_URI');
const logoutUri = requiredEnv('VITE_LOGOUT_URI');
const scopes = requiredEnv('VITE_SCOPES');
const cognitoLogoutUrl = new URL(
  `${cognitoDomain.startsWith('http') ? cognitoDomain : `https://${cognitoDomain}`}/logout`,
);
cognitoLogoutUrl.searchParams.set('client_id', clientId);
cognitoLogoutUrl.searchParams.set('logout_uri', logoutUri);

export const userManager = new UserManager({
  authority,
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: scopes,
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

export function login(): Promise<void> {
  return userManager.signinRedirect();
}

export async function logout(): Promise<void> {
  await userManager.removeUser();
  window.location.assign(cognitoLogoutUrl.toString());
}
