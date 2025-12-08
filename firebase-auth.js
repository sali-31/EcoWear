// assets/js/firebase-auth.js

// 1. Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// 2. Firebase config
const firebaseConfig = {
  authDomain: "ecowear-c2737.firebaseapp.com",
  projectId: "ecowear-c2737",
  storageBucket: "ecowear-c2737.firebasestorage.app",
  messagingSenderId: "870354580438",
  appId: "1:870354580438:web:920e69934d0da58659aa77",
  measurementId: "G-N4CSYPW2EJ",
};

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Keep a global reference if needed
window.ecoAuth = auth;

// 4. Get DOM elements
const overlay = document.getElementById("overlay");
const modal = document.getElementById("modal-content");
const authBtn = document.getElementById("btn-auth");

/* -------------------------------------------------------
   Overlay / modal helpers
------------------------------------------------------- */
function openOverlay() {
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
}

function closeOverlay() {
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
}

// Close modal if clicking outside it
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeOverlay();
});

/* -------------------------------------------------------
   Sync with SPA state in app.js
------------------------------------------------------- */
function markSignedIn(email) {
  if (window.STATE) {
    STATE.signedIn = true;

    if (!STATE.profile) STATE.profile = {};
    if (!STATE.profile.email) STATE.profile.email = email;

    if (typeof window.save === "function") window.save();
    if (typeof window.updateHeaderAuth === "function") window.updateHeaderAuth();
  }
}

function markSignedOut() {
  if (window.STATE) {
    STATE.signedIn = false;

    if (typeof window.save === "function") window.save();
    if (typeof window.updateHeaderAuth === "function") window.updateHeaderAuth();
  }
}

/* -------------------------------------------------------
   Render Auth Modal
------------------------------------------------------- */
function renderAuthModal() {
  modal.innerHTML = `
    <div class="auth-modal">
      <h2>Sign up / Log in</h2>

      <h3>Sign Up</h3>
      <form id="signup-form">
        <input type="email" id="signup-email" class="input" placeholder="Email" required />
        <input type="password" id="signup-password" class="input" placeholder="Password" required />
        <button class="btn btn-primary" type="submit">Create account</button>
      </form>

      <h3 style="margin-top:16px;">Log In</h3>
      <form id="login-form">
        <input type="email" id="login-email" class="input" placeholder="Email" required />
        <input type="password" id="login-password" class="input" placeholder="Password" required />
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>

      <div style="margin-top:20px;display:flex;gap:8px;">
        <button id="logout-btn" class="btn">Log out</button>
        <button id="close-auth" class="btn">Close</button>
      </div>

      <p id="auth-status" style="margin-top:16px;font-size:0.9rem;"></p>
    </div>
  `;

  // Select form elements
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logout-btn");
  const closeBtn = document.getElementById("close-auth");
  const statusP = document.getElementById("auth-status");

  /* -------------------------------------------------------
     SIGN UP
  ------------------------------------------------------- */
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);

      statusP.textContent = "Signed up: " + userCred.user.email;

      markSignedIn(userCred.user.email);
      closeOverlay();

      // Redirect home → Recommended for You
      window.location.hash = "/";
    } catch (err) {
      statusP.textContent = "Sign-up error: " + err.message;
    }
  });

  /* -------------------------------------------------------
     LOG IN
  ------------------------------------------------------- */
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);

      statusP.textContent = "Logged in: " + userCred.user.email;

      markSignedIn(userCred.user.email);
      closeOverlay();

      // Redirect home → Recommended for You
      window.location.hash = "/";
    } catch (err) {
      statusP.textContent = "Login error: " + err.message;
    }
  });

  /* -------------------------------------------------------
     LOG OUT
  ------------------------------------------------------- */
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      markSignedOut();
      statusP.textContent = "Logged out.";
      window.location.hash = "/";
    } catch (err) {
      statusP.textContent = "Logout error: " + err.message;
    }
  });

  // Close button
  closeBtn.addEventListener("click", () => closeOverlay());
}

/* -------------------------------------------------------
   Hook Header Button
------------------------------------------------------- */
authBtn.addEventListener("click", () => {
  renderAuthModal();
  openOverlay();
});

/* -------------------------------------------------------
   Firebase Auth State Listener
------------------------------------------------------- */
onAuthStateChanged(auth, (user) => {
  if (user) {
    authBtn.textContent = "My account";
    authBtn.classList.add("btn-primary");
    markSignedIn(user.email);
  } else {
    authBtn.textContent = "Sign up / Log in";
    authBtn.classList.remove("btn-primary");
    markSignedOut();
  }
});
