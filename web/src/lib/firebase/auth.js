import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

const googleProvider = new GoogleAuthProvider();

function getAuthOrThrow() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      "Firebase is not configured. Add your Firebase env vars to .env.local."
    );
  }
  return auth;
}

export function getAuthErrorMessage(error) {
  const code = error?.code ?? "";

  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled. Please try again.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized for Firebase sign-in.";
    default:
      return error?.message || "Something went wrong. Please try again.";
  }
}

export async function signInWithEmail(email, password) {
  const auth = getAuthOrThrow();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email, password) {
  const auth = getAuthOrThrow();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle() {
  const auth = getAuthOrThrow();
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  const auth = getAuthOrThrow();
  return signOut(auth);
}

export function setupRecaptcha(containerId) {
  const auth = getAuthOrThrow();
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: (response) => {
        // reCAPTCHA solved
      },
    });
  }
  return window.recaptchaVerifier;
}

export function clearRecaptcha() {
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (e) {}
    window.recaptchaVerifier = null;
  }
}

export async function signInWithPhone(phoneNumber, appVerifier) {
  const auth = getAuthOrThrow();
  return signInWithPhoneNumber(auth, phoneNumber, appVerifier);
}
