/**
 * Nestlé Smart Logistics - Firebase Auth Configuration
 * This file initializes Firebase for the Login and Registration pages.
 */

(function() {
  const config = {
    apiKey: "AIzaSyDtTMrEGjIJ5aJYNJQnARXxXrJDnEUt4vM",
    authDomain: "rural-logistics-app.firebaseapp.com",
    databaseURL: "https://rural-logistics-app-default-rtdb.firebaseio.com",
    projectId: "rural-logistics-app",
    storageBucket: "rural-logistics-app.firebasestorage.app",
    messagingSenderId: "684830139102",
    appId: "1:684830139102:web:850e4e5802aac76335584f"
  };

    // Initialize Firebase if not already initialized
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
        window.__firebase_ready = true;
        console.log('Firebase initialized successfully from auth.js');
      } else {
        window.__firebase_ready = true;
      }
    } else {
    console.error('Firebase SDK not found. Please ensure Firebase scripts are included before auth.js');
  }
})();