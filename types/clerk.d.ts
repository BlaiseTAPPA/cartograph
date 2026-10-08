export {};

declare global {
  // Added through Clerk's session-token customization so the organization's
  // name is on the token and nothing has to ask Clerk for it at render time.
  interface CustomJwtSessionClaims {
    org_name?: string;
  }
}
