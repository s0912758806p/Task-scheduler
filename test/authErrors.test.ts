import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../app/(auth)/login/authErrors';

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'INVALID_EMAIL_OR_PASSWORD' }, null, 'email 或密碼錯誤'],
    [{ code: 'USER_ALREADY_EXISTS' }, null, '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）'],
    [
      { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
      null,
      '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）',
    ],
    [{ code: 'PASSWORD_TOO_SHORT' }, null, '密碼需為 8 到 128 個字元'],
    [{ code: 'PASSWORD_TOO_LONG' }, null, '密碼需為 8 到 128 個字元'],
    [{ code: 'INVALID_EMAIL' }, null, 'email 格式不正確'],
    [{ status: 429 }, '42', '嘗試太多次，請 42 秒後再試'],
    [{ status: 429 }, null, '嘗試太多次，請稍後再試'],
    [{ status: 429 }, 'abc', '嘗試太多次，請稍後再試'],
    [{ code: 'SOMETHING_ELSE', status: 500 }, null, '登入失敗，請再試一次。'],
    [null, null, '登入失敗，請再試一次。'],
  ])('%j / %s → %s', (e, retry, msg) => expect(authErrorMessage(e, retry)).toBe(msg));
});
