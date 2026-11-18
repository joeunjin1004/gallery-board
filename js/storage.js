/**
 * 데이터 저장소 서비스 (Firebase Firestore 구현체)
 * 
 * 모든 게시글 데이터(제목, 내용, 작성자 정보, 작성일, 수정일, 이미지 URL)를 
 * Google Cloud Firebase Firestore 데이터베이스의 'posts' 컬렉션에 영구 저장 및 실시간 동기화합니다.
 */
(function(window) {
  const COLLECTION_NAME = 'posts';
  const sampleImages = window.GallerySampleImages || [];

  class FirestoreService {
    constructor() {
      this.db = window.firebaseDb;
      this.collection = this.db.collection(COLLECTION_NAME);
    }

    /**
     * Firestore 문서를 클라이언트 게시글 객체 규격으로 변환
     * @private
     */
    _docToPost(doc) {
      const data = doc.data();
      
      // Firestore Timestamp 또는 ISO 문자열을 표준 ISO 문자열로 변환
      let createdAtStr = new Date().toISOString();
      if (data.createdAt) {
        if (typeof data.createdAt.toDate === 'function') {
          createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
          createdAtStr = data.createdAt;
        }
      }

      let updatedAtStr = createdAtStr;
      if (data.updatedAt) {
        if (typeof data.updatedAt.toDate === 'function') {
          updatedAtStr = data.updatedAt.toDate().toISOString();
        } else if (typeof data.updatedAt === 'string') {
          updatedAtStr = data.updatedAt;
        }
      }

      const authorEmail = data.authorEmail || '';
      const fallbackName = authorEmail ? authorEmail.split('@')[0] : '익명 사용자';
      const authorName = data.authorName || fallbackName;

      const defaultImg = (window.cloudinaryService && window.cloudinaryService.defaultImage) 
        ? window.cloudinaryService.defaultImage 
        : 'images/default-landscape.jpg';

      let imageUrl = data.imageUrl || defaultImg;

      // Unsplash 외부 링크가 핫링크 차단되거나 깨지는 경우, 감성적인 실제 풍경 사진으로 자동 매핑
      if (typeof imageUrl === 'string') {
        if (imageUrl.includes('photo-1506744038136')) {
          imageUrl = 'images/sample-lake.jpg';
        } else if (imageUrl.includes('photo-1511497584788')) {
          imageUrl = 'images/sample-forest.jpg';
        } else if (imageUrl.includes('photo-1507525428034')) {
          imageUrl = 'images/sample-sunset.jpg';
        } else if (imageUrl.includes('photo-1618005182384') || imageUrl.includes('placeholder.svg')) {
          imageUrl = 'images/default-landscape.jpg';
        }
      }

      return {
        id: doc.id,
        title: data.title || '',
        content: data.content || '',
        imageUrl: imageUrl,
        authorId: data.authorId || null,
        authorEmail: authorEmail,
        authorName: authorName,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr
      };
    }

    /**
     * 전체 게시글 목록 조회 (작성일 최신순)
     * @returns {Promise<Array>}
     */
    async getPosts() {
      try {
        const snapshot = await this.collection.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => this._docToPost(doc));
      } catch (error) {
        console.error('[Firestore] 게시글 목록 조회 실패:', error);
        throw error;
      }
    }

    /**
     * 실시간 게시글 목록 구독 (여러 사용자의 동시 변경사항 실시간 반영)
     * @param {Function} onUpdate 변경 시 콜백
     * @param {Function} onError 오류 콜백
     * @returns {Function} 구독 해제 함수 (unsubscribe)
     */
    subscribePosts(onUpdate, onError) {
      return this.collection.orderBy('createdAt', 'desc').onSnapshot(
        (snapshot) => {
          const posts = snapshot.docs.map(doc => this._docToPost(doc));
          onUpdate(posts);
        },
        (error) => {
          console.error('[Firestore] 실시간 동기화 에러:', error);
          if (onError) onError(error);
        }
      );
    }

    /**
     * 특정 게시글 단건 조회
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getPostById(id) {
      try {
        const doc = await this.collection.doc(id).get();
        if (!doc.exists) {
          return null;
        }
        return this._docToPost(doc);
      } catch (error) {
        console.error('[Firestore] 게시글 상세 조회 실패:', error);
        throw error;
      }
    }

    /**
     * 새 게시글 등록 (로그인된 사용자의 authorId 및 authorEmail 저장)
     * @param {Object} postData { title, content, imageUrl }
     * @returns {Promise<Object>}
     */
    async createPost({ title, content, imageUrl }) {
      const user = window.firebaseAuth?.currentUser;
      if (!user) {
        throw new Error('게시글을 작성하려면 로그인이 필요합니다.');
      }

      try {
        const nowTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        const authorEmail = user.email || '';
        const authorName = user.displayName || (authorEmail ? authorEmail.split('@')[0] : '사용자');

        const defaultImg = (window.cloudinaryService && window.cloudinaryService.defaultImage) 
          ? window.cloudinaryService.defaultImage 
          : 'images/default-landscape.jpg';

        const postData = {
          title: title.trim(),
          content: content.trim(),
          imageUrl: imageUrl || defaultImg,
          authorId: user.uid,
          authorEmail: authorEmail,
          authorName: authorName,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp
        };

        const docRef = await this.collection.add(postData);
        return {
          id: docRef.id,
          ...postData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('[Firestore] 게시글 등록 실패:', error);
        throw error;
      }
    }

    /**
     * 게시글 수정 (작성자 본인 검증 후 업데이트)
     * @param {string} id
     * @param {Object} updateData { title, content, imageUrl }
     * @returns {Promise<Object>}
     */
    async updatePost(id, { title, content, imageUrl }) {
      const user = window.firebaseAuth?.currentUser;
      if (!user) {
        throw new Error('게시글을 수정하려면 먼저 로그인해주세요.');
      }

      try {
        // 기존 문서 검증
        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          throw new Error('수정할 게시글을 찾을 수 없습니다.');
        }

        const currentData = docSnap.data();
        if (currentData.authorId && currentData.authorId !== user.uid) {
          throw new Error('본인이 작성한 게시글만 수정할 수 있습니다.');
        }

        const nowTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        const updateData = {
          title: title.trim(),
          content: content.trim(),
          imageUrl: imageUrl,
          updatedAt: nowTimestamp
        };

        await docRef.update(updateData);
        return {
          id,
          ...updateData,
          updatedAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('[Firestore] 게시글 수정 실패:', error);
        throw error;
      }
    }

    /**
     * 게시글 삭제 (작성자 본인 검증 후 삭제)
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async deletePost(id) {
      const user = window.firebaseAuth?.currentUser;
      if (!user) {
        throw new Error('게시글을 삭제하려면 먼저 로그인해주세요.');
      }

      try {
        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          throw new Error('삭제할 게시글을 찾을 수 없습니다.');
        }

        const currentData = docSnap.data();
        if (currentData.authorId && currentData.authorId !== user.uid) {
          throw new Error('본인이 작성한 게시글만 삭제할 수 있습니다.');
        }

        await docRef.delete();
        return true;
      } catch (error) {
        console.error('[Firestore] 게시글 삭제 실패:', error);
        throw error;
      }
    }
  }

  // 전역 서비스 인스턴스를 FirestoreService로 등록
  window.postService = new FirestoreService();
})(window);
