// Chinese messages for the login page (spec 2026-11-24-email-password-login-design §5.3).
// authErrorMessage(e, retryAfter) maps a Better Auth client error ({ code, status }) to the text
// shown under the form: an HTTP 429 says how many seconds to wait when retryAfter (the
// X-Retry-After header) is a positive whole number, else 「稍後再試」; known codes get their own
// message; anything else, or no error object at all, the generic one.

export const GENERIC_ERROR = '登入失敗，請再試一次。';
export const NOT_LINKED_ERROR =
  '這個 email 已經用另一種方式註冊過，且尚未驗證，因此無法自動合併。請改用當初的方式登入。';

const ALREADY_REGISTERED = '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）';
const PASSWORD_LENGTH = '密碼需為 8 到 128 個字元';

const BY_CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'email 或密碼錯誤',
  USER_ALREADY_EXISTS: ALREADY_REGISTERED,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: ALREADY_REGISTERED,
  PASSWORD_TOO_SHORT: PASSWORD_LENGTH,
  PASSWORD_TOO_LONG: PASSWORD_LENGTH,
  INVALID_EMAIL: 'email 格式不正確',
};

export function authErrorMessage(
  e: { code?: string; status?: number } | null | undefined,
  retryAfter?: string | null,
): string {
  if (e?.status === 429) {
    return retryAfter && /^[1-9]\d*$/.test(retryAfter)
      ? `嘗試太多次，請 ${retryAfter} 秒後再試`
      : '嘗試太多次，請稍後再試';
  }
  return (e?.code && Object.hasOwn(BY_CODE, e.code) ? BY_CODE[e.code] : undefined) ?? GENERIC_ERROR;
}
