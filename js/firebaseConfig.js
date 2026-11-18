/**
 * Firebase 설정 및 초기화 모듈
 */
(function(window) {
  const firebaseConfig = {
    apiKey: "AIzaSyCz_CFFBdwb6BIkSJWI0cCTU0ASaRjohhA",
    authDomain: "gallery-board-bf6e8.firebaseapp.com",
    projectId: "gallery-board-bf6e8",
    storageBucket: "gallery-board-bf6e8.firebasestorage.app",
    messagingSenderId: "94631005239",
    appId: "1:94631005239:web:e55a0ce7a9223a67f403b2"
  };

  // Firebase 초기화 (중복 초기화 방지)
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Firestore & Auth 인스턴스 등록
  const db = firebase.firestore();
  const auth = firebase.auth();

  window.firebaseDb = db;
  window.firebaseAuth = auth;
})(window);
