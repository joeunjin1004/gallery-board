# 🖼️ 갤러리형 온라인 게시판 (Gallery Board) - Full Stack 연동

Google Cloud **Firebase Firestore**(데이터베이스), **Firebase Authentication**(사용자 인증), **Cloudinary**(클라우드 이미지 호스팅)가 완벽하게 통합된 풀스택 반응형 갤러리 게시판입니다.

- **🌐 Live Demo (Vercel 배포)**: [https://galleryboard-plum.vercel.app](https://galleryboard-plum.vercel.app)
- **📦 GitHub Repository**: [https://github.com/joeunjin1004/gallery-board](https://github.com/joeunjin1004/gallery-board)

---

## 📌 주요 구현 기능

1. **Cloudinary 클라우드 다중 이미지 업로드 & 대표 이미지 지정**
   - **사진 여러 장 첨부**: 클릭 또는 드래그 앤 드롭으로 여러 장의 사진 동시 첨부 지원
   - **대표 이미지(커버) 설정**: 첨부된 사진 중 원하는 사진을 클릭하여 게시판 썸네일로 보일 **[★ 대표 이미지]** 지정 가능
   - **개별 사진 삭제 및 추가**: 첨부된 사진 목록에서 개별 삭제(✕) 및 추가 업로드 지원
   - **다중 갤러리 뷰어**: 상세 보기 모달에서 하단 썸네일 스트립을 통해 첨부된 모든 사진을 전환하며 열람 가능
   - **사진 장수 뱃지**: 갤러리 카드 썸네일 우측 상단에 `📷 N장` 뱃지 표시
   - **업로드 진행률 표시**: 다중 업로드 시 실시간 프로그레스 바(0% ~ 100%) 및 진행 장수 표시
   - **선택적 업로드**: 이미지를 첨부하지 않아도 감성적인 기본 풍경 사진으로 안전하게 등록 가능
2. **Firebase Authentication 사용자 인증**
   - 이메일/비밀번호 회원가입 및 로그인
   - 비로그인 사용자도 게시글 목록과 상세 내용 조회 가능
   - 로그인한 사용자만 새 게시글 작성 가능
3. **권한 기반 수정·삭제 제어**
   - 게시글 작성 시 로그인 사용자의 `authorId`(UID) 저장
   - 본인이 작성한 게시글에 대해서만 `수정하기` / `삭제하기` 버튼 노출 및 처리
4. **Firebase Firestore 실시간 데이터베이스 (`onSnapshot`)**
   - 게시글 추가·수정·삭제가 모든 접속자에게 새로고침 없이 실시간 반영
5. **모던 반응형 갤러리 디자인**
   - **PC**: 3열 카드 그리드
   - **태블릿**: 2열 카드 그리드
   - **모바일**: 1열 카드 그리드
   - 16:10 비율 썸네일 중심의 세련된 카드 UI

---

## 📁 프로젝트 구조

```text
gallery_board/
├── index.html              # 메인 마크업 (Cloudinary 업로더, Auth 모달, 갤러리 그리드)
├── css/
│   └── style.css           # 반응형 3열 그리드, 이미지 드롭존, 미리보기, 프로그레스 바 스타일
├── js/
│   ├── firebaseConfig.js    # Firebase 초기화 (Firestore & Auth)
│   ├── auth.js              # 회원가입, 로그인, 로그아웃 서비스
│   ├── cloudinaryService.js # Cloudinary Unsigned Upload API & 프로그레스 서비스
│   ├── storage.js           # Firestore CRUD 및 실시간 동기화 서비스
│   └── app.js               # UI 렌더링, 파일 업로드 제어, 모달 제어
└── README.md               # 프로젝트 안내 및 설정 가이드
```

---

## 🛡️ Firebase 콘솔 필수 설정 가이드

### 1. Authentication 이메일/비밀번호 로그인 활성화
- Firebase 콘솔 > `gallery-board-bf6e8` > **Authentication > Sign-in method**
- **이메일/비밀번호(Email/Password)** 활성화

### 2. Firestore 보안 규칙 (Security Rules) 설정
- Firebase 콘솔 > **Firestore Database > 규칙(Rules)**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      // 1. 누구나 게시글 목록 및 상세 열람 가능
      allow read: if true;

      // 2. 로그인한 사용자만 새 게시글 작성 가능 (본인 UID가 authorId로 일치해야 함)
      allow create: if request.auth != null 
                    && request.resource.data.authorId == request.auth.uid
                    && request.resource.data.title is string 
                    && request.resource.data.title.size() > 0
                    && request.resource.data.content is string;

      // 3. 본인이 작성한 게시글만 수정 가능
      allow update: if request.auth != null 
                    && resource.data.authorId == request.auth.uid
                    && request.resource.data.authorId == resource.data.authorId
                    && request.resource.data.title is string 
                    && request.resource.data.title.size() > 0
                    && request.resource.data.content is string;

      // 4. 본인이 작성한 게시글만 삭제 가능
      allow delete: if request.auth != null 
                    && resource.data.authorId == request.auth.uid;
    }
  }
}
```

---

## 🚀 실행 및 테스트 방법

1. `index.html` 파일을 웹 브라우저에서 실행합니다.
2. 상단 `회원가입` 또는 `로그인` 버튼을 눌러 로그인합니다.
3. `새 글 작성` 버튼을 클릭하여 작성 모달을 엽니다.
4. **이미지 업로드 테스트**:
   - PC에 있는 사진 파일을 드롭존에 드래그하거나 클릭하여 선택합니다.
   - 즉시 썸네일 미리보기가 표시되는 것을 확인합니다.
   - 제목과 내용을 입력 후 `등록하기` 버튼을 누르면 실시간 프로그레스 바(`0% ~ 100%`)와 함께 Cloudinary로 업로드된 후 Firestore에 저장됩니다.
5. **이미지 미첨부 테스트**:
   - 이미지를 선택하지 않고 제목과 내용만 작성하여 등록하면 깔끔한 기본 갤러리 썸네일로 자동 등록됩니다.
6. **게시글 수정 테스트**:
   - 내가 쓴 글의 상세 모달에서 `수정하기`를 눌러 이미지를 다른 사진으로 교체하거나 삭제 후 수정할 수 있습니다.
