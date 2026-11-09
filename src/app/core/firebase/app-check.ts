import { FirebaseApp } from 'firebase/app';
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';

/**
 * Starts Firebase App Check with reCAPTCHA v3, so Firestore can tell requests from this site
 * apart from scripts that copied its public API key. Loaded with the Firestore SDK, and only
 * when `appCheckSiteKey` is set. Requests are refused without a token only after App Check
 * enforcement is turned on for Firestore in the Firebase console.
 */
export function startAppCheck(app: FirebaseApp, siteKey: string): void {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
