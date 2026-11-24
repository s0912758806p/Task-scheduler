// hardNavigate(url): a full page load (window.location.assign), used after an email/password
// sign-in or sign-up so the server layout renders again with the new session cookie. Its own
// module so component tests can mock it (jsdom cannot navigate).
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
