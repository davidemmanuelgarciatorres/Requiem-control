import type { Dictionary } from '../../i18n/es';
import { ApiError } from '../../lib/api';
import { interpolate } from '../../lib/format';

export const PASSWORD_MIN_LENGTH = 10;

/** Traduce un error de la API a un mensaje para el usuario (sin detalles internos). */
export function errorMessage(t: Dictionary, e: unknown): string {
  if (!(e instanceof ApiError)) return t.auth.errors.generic;
  switch (e.code) {
    case 'auth.invalid_credentials': return t.auth.errors.invalidCredentials;
    case 'auth.rate_limited': return t.auth.errors.rateLimited;
    case 'auth.email_taken': return t.auth.errors.emailTaken;
    case 'auth.password_too_short':
      return interpolate(t.auth.errors.passwordTooShort, { n: Number(e.extra.min_length ?? PASSWORD_MIN_LENGTH) });
    case 'request.invalid': return t.auth.errors.invalid;
    case 'network.unreachable': return t.auth.apiUnreachableTitle;
    case 'auth.forbidden': return t.account.noPermission;
    case 'auth.token_invalid': return t.recovery.errors.tokenInvalid;
    case 'auth.wrong_password': return t.recovery.errors.wrongPassword;
    case 'invitation.invalid': return t.recovery.errors.invitationInvalid;
    case 'email.not_configured': return t.recovery.errors.emailNotConfigured;
    default: return e.message || t.auth.errors.generic;
  }
}
