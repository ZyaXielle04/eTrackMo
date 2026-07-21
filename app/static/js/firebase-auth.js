import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

export { auth };
