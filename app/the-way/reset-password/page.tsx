// Where "Forgot password?" emails link to. WayAuthGate recognizes this path
// and shows WayResetPasswordForm in place of the app, so this page itself
// never renders anything. It only exists so the route resolves.
export default function WayResetPasswordPage() {
  return null;
}
