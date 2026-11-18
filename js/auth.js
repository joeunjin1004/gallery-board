/**
 * Firebase Authentication 인증 서비스 모듈
 */
(function(window) {
  const auth = window.firebaseAuth;

  /**
   * Firebase Auth 에러 코드를 친절한 한글 메시지로 변환
   */
  function getFriendlyAuthErrorMessage(error) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일 주소입니다.';
      case 'auth/invalid-email':
        return '유효하지 않은 이메일 형식입니다.';
      case 'auth/operation-not-allowed':
        return '이메일/비밀번호 인증이 Firebase 콘솔에서 활성화되지 않았습니다. Authentication > Sign-in method에서 이메일/비밀번호 로그인을 활성화해주세요.';
      case 'auth/weak-password':
        return '비밀번호는 최소 6자리 이상이어야 합니다.';
      case 'auth/user-disabled':
        return '비활성화된 사용자 계정입니다.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'auth/too-many-requests':
        return '로그인 시도가 너무 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.';
      default:
        return error.message || '인증 처리 중 오류가 발생했습니다.';
    }
  }

  class AuthService {
    constructor() {
      this.auth = auth;
      this.currentUser = null;
    }

    /**
     * 현재 로그인된 유저 가져오기
     */
    getCurrentUser() {
      return this.auth.currentUser;
    }

    /**
     * 인증 상태 변화 리스너 등록
     */
    onAuthStateChanged(callback) {
      return this.auth.onAuthStateChanged((user) => {
        this.currentUser = user;
        callback(user);
      });
    }

    /**
     * 이메일/비밀번호 회원가입
     * @param {string} email
     * @param {string} password
     * @param {string} nickname
     */
    async signUp(email, password, nickname) {
      try {
        const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 닉네임(displayName) 설정
        if (nickname && nickname.trim()) {
          await user.updateProfile({
            displayName: nickname.trim()
          });
        }
        return user;
      } catch (error) {
        console.error('[Auth] 회원가입 오류:', error);
        throw new Error(getFriendlyAuthErrorMessage(error));
      }
    }

    /**
     * 이메일/비밀번호 로그인
     * @param {string} email
     * @param {string} password
     */
    async login(email, password) {
      try {
        const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
        return userCredential.user;
      } catch (error) {
        console.error('[Auth] 로그인 오류:', error);
        throw new Error(getFriendlyAuthErrorMessage(error));
      }
    }

    /**
     * 로그아웃
     */
    async logout() {
      try {
        await this.auth.signOut();
      } catch (error) {
        console.error('[Auth] 로그아웃 오류:', error);
        throw new Error(getFriendlyAuthErrorMessage(error));
      }
    }
  }

  window.authService = new AuthService();
})(window);
