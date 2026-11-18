/**
 * 갤러리 보드 메인 애플리케이션 로직
 * Firebase Firestore, Firebase Authentication, Cloudinary & 회원별 사진 모아보기 필터 통합
 */
(function() {
  const postService = window.postService;
  const authService = window.authService;
  const cloudinaryService = window.cloudinaryService;

  // DOM 요소 캐싱 - 헤더 및 사용자 상태
  const guestActions = document.getElementById('guest-actions');
  const userActions = document.getElementById('user-actions');
  const userDisplayName = document.getElementById('user-display-name');
  const btnOpenLogin = document.getElementById('btn-open-login');
  const btnOpenSignup = document.getElementById('btn-open-signup');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenCreate = document.getElementById('btn-open-create');

  // DOM 요소 캐싱 - 메인 갤러리 & 회원별 필터
  const galleryGrid = document.getElementById('gallery-grid');
  const postCountBadge = document.getElementById('post-count');
  const memberFilterChips = document.getElementById('member-filter-chips');
  const activeFilterIndicator = document.getElementById('active-filter-indicator');
  const activeFilterName = document.getElementById('active-filter-name');
  const btnResetFilter = document.getElementById('btn-reset-filter');

  // DOM 요소 캐싱 - 상세 모달
  const detailModal = document.getElementById('detail-modal');
  const detailTitle = document.getElementById('detail-title');
  const detailAuthor = document.getElementById('detail-author');
  const detailDate = document.getElementById('detail-date');
  const detailContent = document.getElementById('detail-content');
  const detailImage = document.getElementById('detail-image');
  const btnDetailEdit = document.getElementById('btn-detail-edit');
  const btnDetailDelete = document.getElementById('btn-detail-delete');

  // DOM 요소 캐싱 - 작성/수정 모달 & Cloudinary 업로드
  const formModal = document.getElementById('form-modal');
  const postForm = document.getElementById('post-form');
  const formModalTitle = document.getElementById('form-modal-title');
  const postIdInput = document.getElementById('post-id');
  const postTitleInput = document.getElementById('post-title');
  const postContentInput = document.getElementById('post-content');
  const postImageFileInput = document.getElementById('post-image-file');
  const existingImageUrlInput = document.getElementById('existing-image-url');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const previewFilename = document.getElementById('preview-filename');
  const btnRemoveImage = document.getElementById('btn-remove-image');
  const btnChangeImage = document.getElementById('btn-change-image');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadStatusText = document.getElementById('upload-status-text');
  const btnFormSubmit = document.getElementById('btn-form-submit');

  // DOM 요소 캐싱 - 인증(로그인/회원가입) 모달
  const authModal = document.getElementById('auth-modal');
  const authModalTitle = document.getElementById('auth-modal-title');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const authForm = document.getElementById('auth-form');
  const nicknameGroup = document.getElementById('nickname-group');
  const authNicknameInput = document.getElementById('auth-nickname');
  const authEmailInput = document.getElementById('auth-email');
  const authPasswordInput = document.getElementById('auth-password');
  const authErrorBox = document.getElementById('auth-error-box');
  const btnAuthSubmit = document.getElementById('btn-auth-submit');
  const authSwitchPrompt = document.getElementById('auth-switch-prompt');
  const authSwitchBtn = document.getElementById('auth-switch-btn');

  // 상태 변수
  let cachedAllPosts = []; // Firestore 실시간 동기화로 가져온 전체 게시글 원본
  let currentFilter = { type: 'all', id: null, name: '전체' }; // 'all' | 'my' | 'member'
  let currentDetailPost = null; // 현재 열람 중인 게시글 객체
  let currentAuthMode = 'login'; // 'login' | 'signup'
  let currentSelectedFile = null; // 사용자가 새로 선택한 이미지 파일
  let currentExistingImageUrl = ''; // 수정 모드 시 기존 이미지 URL

  // =========================================================
  // 날짜 포맷 유틸
  // =========================================================
  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  }

  // HTML 엔티티 이스케이프 (XSS 방지)
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =========================================================
  // 모달 제어 함수
  // =========================================================
  function openModal(modalElement) {
    modalElement.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalElement) {
    modalElement.classList.remove('active');
    if (!document.querySelector('.modal-backdrop.active')) {
      document.body.style.overflow = '';
    }
  }

  // =========================================================
  // 1. 인증(Auth) 상태 변경 및 UI 동기화
  // =========================================================
  function handleAuthStateChanged(user) {
    if (user) {
      guestActions.style.display = 'none';
      userActions.style.display = 'flex';
      
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : '사용자');
      userDisplayName.textContent = displayName;
    } else {
      guestActions.style.display = 'flex';
      userActions.style.display = 'none';
      // 만약 '내 사진 모아보기' 필터 중 로그아웃된 경우 '전체'로 초기화
      if (currentFilter.type === 'my') {
        applyFilter('all');
      }
    }

    // 회원 필터 칩 바 재계산 및 렌더링
    renderMemberFilterChips();

    if (currentDetailPost) {
      updateDetailModalActionButtons(currentDetailPost);
    }
  }

  // =========================================================
  // 2. 인증(로그인 / 회원가입) 모달 로직
  // =========================================================
  function setAuthMode(mode) {
    currentAuthMode = mode;
    authErrorBox.classList.remove('active');
    authErrorBox.textContent = '';

    if (mode === 'signup') {
      authModalTitle.textContent = '회원가입';
      tabSignup.classList.add('active');
      tabLogin.classList.remove('active');
      nicknameGroup.style.display = 'block';
      btnAuthSubmit.textContent = '회원가입 완료';
      authSwitchPrompt.textContent = '이미 계정이 있으신가요?';
      authSwitchBtn.textContent = '로그인';
    } else {
      authModalTitle.textContent = '로그인';
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      nicknameGroup.style.display = 'none';
      btnAuthSubmit.textContent = '로그인';
      authSwitchPrompt.textContent = '계정이 없으신가요?';
      authSwitchBtn.textContent = '회원가입';
    }
  }

  function openAuthModal(mode = 'login') {
    authForm.reset();
    setAuthMode(mode);
    openModal(authModal);
    authEmailInput.focus();
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    const nickname = authNicknameInput.value.trim();

    authErrorBox.classList.remove('active');
    authErrorBox.textContent = '';
    btnAuthSubmit.disabled = true;

    try {
      if (currentAuthMode === 'signup') {
        btnAuthSubmit.textContent = '회원가입 중...';
        await authService.signUp(email, password, nickname);
      } else {
        btnAuthSubmit.textContent = '로그인 중...';
        await authService.login(email, password);
      }

      closeModal(authModal);
      authForm.reset();
    } catch (error) {
      authErrorBox.textContent = error.message;
      authErrorBox.classList.add('active');
    } finally {
      btnAuthSubmit.disabled = false;
      btnAuthSubmit.textContent = currentAuthMode === 'signup' ? '회원가입 완료' : '로그인';
    }
  }

  async function handleLogout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      try {
        await authService.logout();
      } catch (error) {
        alert('로그아웃 중 오류가 발생했습니다: ' + error.message);
      }
    }
  }

  // =========================================================
  // 3. 회원별 사진 모아보기 필터 로직
  // =========================================================

  /**
   * 필터 적용 함수
   * @param {'all'|'my'|'member'} type 필터 타입
   * @param {string|null} id 회원 UID 또는 고유 식별자
   * @param {string} name 화면에 표시할 회원 이름
   */
  function applyFilter(type, id = null, name = '전체') {
    currentFilter = { type, id, name };

    // 인디케이터 표시 제어
    if (type === 'all') {
      activeFilterIndicator.style.display = 'none';
    } else {
      activeFilterIndicator.style.display = 'inline-flex';
      activeFilterName.textContent = name;
    }

    renderMemberFilterChips();
    renderFilteredGallery();
  }

  /**
   * 회원 필터 칩 목록 동적 렌더링
   */
  function renderMemberFilterChips() {
    if (!memberFilterChips) return;

    const currentUser = authService.getCurrentUser();
    const totalCount = cachedAllPosts.length;

    // 1. 고유 회원 및 글 개수 집계
    const memberMap = new Map();
    let myCount = 0;

    cachedAllPosts.forEach(post => {
      // 내 사진 개수 계산
      if (currentUser && post.authorId && post.authorId === currentUser.uid) {
        myCount++;
      }

      // 회원별 그룹화 키 (authorId 우선, 없으면 authorName)
      const memberKey = post.authorId || post.authorName || 'unknown';
      const memberDisplayName = post.authorName || (post.authorEmail ? post.authorEmail.split('@')[0] : '익명 사용자');

      if (!memberMap.has(memberKey)) {
        memberMap.set(memberKey, {
          id: post.authorId || null,
          name: memberDisplayName,
          count: 0
        });
      }
      memberMap.get(memberKey).count += 1;
    });

    const members = Array.from(memberMap.values());

    let chipsHtml = `
      <button type="button" class="filter-chip ${currentFilter.type === 'all' ? 'active' : ''}" data-filter-type="all">
        <span>📁 전체 보기</span>
        <span class="chip-count">${totalCount}</span>
      </button>
    `;

    // 로그인 상태이고 내가 작성한 글이 있다면 '내 사진 모아보기' 칩 추가
    if (currentUser && myCount > 0) {
      chipsHtml += `
        <button type="button" class="filter-chip chip-my ${currentFilter.type === 'my' ? 'active' : ''}" data-filter-type="my">
          <span>⭐ 내 사진 모아보기</span>
          <span class="chip-count">${myCount}</span>
        </button>
      `;
    }

    // 각 회원별 칩 생성
    members.forEach(member => {
      // 로그인한 본인의 별도 칩과 중복되지 않도록 처리
      const isMyKey = currentUser && member.id && member.id === currentUser.uid;
      const isCurrentActive = currentFilter.type === 'member' && 
        ((member.id && currentFilter.id === member.id) || (!member.id && currentFilter.name === member.name));

      chipsHtml += `
        <button type="button" class="filter-chip ${isCurrentActive ? 'active' : ''}" 
                data-filter-type="member" 
                data-member-id="${member.id || ''}" 
                data-member-name="${escapeHtml(member.name)}">
          <span>👤 ${escapeHtml(member.name)}${isMyKey ? ' (나)' : ''}</span>
          <span class="chip-count">${member.count}</span>
        </button>
      `;
    });

    memberFilterChips.innerHTML = chipsHtml;

    // 칩 클릭 이벤트 바인딩
    memberFilterChips.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.filterType;
        if (type === 'all') {
          applyFilter('all');
        } else if (type === 'my') {
          applyFilter('my', currentUser.uid, '내 사진 모아보기');
        } else if (type === 'member') {
          const id = btn.dataset.memberId || null;
          const name = btn.dataset.memberName;
          applyFilter('member', id, name);
        }
      });
    });
  }

  /**
   * 현재 필터 조건에 따라 필터링된 게시글 렌더링
   */
  function renderFilteredGallery() {
    const currentUser = authService.getCurrentUser();
    let filteredPosts = cachedAllPosts;

    if (currentFilter.type === 'my' && currentUser) {
      filteredPosts = cachedAllPosts.filter(p => p.authorId && p.authorId === currentUser.uid);
    } else if (currentFilter.type === 'member') {
      filteredPosts = cachedAllPosts.filter(p => {
        if (currentFilter.id && p.authorId) {
          return p.authorId === currentFilter.id;
        }
        return (p.authorName || '익명 사용자') === currentFilter.name;
      });
    }

    renderGalleryList(filteredPosts);
  }

  // =========================================================
  // 4. 갤러리 목록 렌더링
  // =========================================================
  function renderGalleryList(posts) {
    const isFiltered = currentFilter.type !== 'all';
    postCountBadge.textContent = isFiltered 
      ? `검색 결과: ${posts.length}개 / 전체 ${cachedAllPosts.length}개`
      : `전체 게시글: ${posts.length}개`;

    if (!posts || posts.length === 0) {
      galleryGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📷</div>
          <h3>${isFiltered ? `'${escapeHtml(currentFilter.name)}' 회원의 등록된 사진이 없습니다.` : '등록된 게시글이 없습니다.'}</h3>
          <p>${isFiltered ? '다른 회원을 선택하거나 전체 사진을 확인해보세요.' : '첫 번째 사진과 이야기를 등록해보세요!'}</p>
          ${isFiltered 
            ? '<button type="button" class="btn btn-outline" id="btn-empty-reset">전체 사진 보기</button>' 
            : '<button type="button" class="btn btn-primary" id="btn-empty-create">게시글 작성하기</button>'}
        </div>
      `;
      document.getElementById('btn-empty-create')?.addEventListener('click', handleCreateButtonClick);
      document.getElementById('btn-empty-reset')?.addEventListener('click', () => applyFilter('all'));
      return;
    }

    galleryGrid.innerHTML = posts.map(post => {
      const excerpt = post.content ? post.content.replace(/\n+/g, ' ') : '';
      const authorText = post.authorName || '익명 사용자';
      const displayImageUrl = post.imageUrl || (cloudinaryService ? cloudinaryService.defaultImage : 'images/default-landscape.jpg');

      return `
        <article class="gallery-card" data-post-id="${post.id}" tabindex="0" role="button" aria-label="${escapeHtml(post.title)} 상세보기">
          <div class="card-thumbnail-wrapper">
            <img class="card-thumbnail" 
                 src="${escapeHtml(displayImageUrl)}" 
                 alt="${escapeHtml(post.title)}" 
                 loading="lazy" 
                 referrerpolicy="no-referrer"
                 onerror="this.onerror=null; this.src='images/default-landscape.jpg';">
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(post.title)}</h3>
            <p class="card-excerpt">${escapeHtml(excerpt)}</p>
            <div class="card-footer">
              <!-- 작성자 이름 클릭 시 해당 회원의 사진만 모아보기 -->
              <button type="button" 
                      class="card-author-btn" 
                      data-filter-author-id="${post.authorId || ''}" 
                      data-filter-author-name="${escapeHtml(authorText)}" 
                      title="${escapeHtml(authorText)}님의 사진 모아보기">
                <span>👤</span>
                <span>${escapeHtml(authorText)}</span>
              </button>
              <span class="card-date">📅 ${formatDate(post.createdAt)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderErrorMessage(error) {
    console.error('Firestore 연결/동기화 오류:', error);
    const isPermissionError = error.code === 'permission-denied' || error.message?.includes('permission');
    
    galleryGrid.innerHTML = `
      <div class="empty-state" style="border-color: #fca5a5; background-color: #fef2f2;">
        <div class="empty-state-icon" style="color: var(--danger-color);">⚠️</div>
        <h3 style="color: #991b1b;">Firebase 데이터베이스 오류</h3>
        <p style="color: #b91c1c; max-width: 500px; margin: 0 auto 1.5rem;">
          ${isPermissionError 
            ? 'Firestore 보안 규칙(Security Rules)에 의해 요청이 거부되었습니다.<br>Firebase 콘솔에서 Authentication 연동 규칙을 확인해주세요.' 
            : '게시글 목록을 불러오는 중 오류가 발생했습니다: ' + escapeHtml(error.message)}
        </p>
        <button type="button" class="btn btn-outline" onclick="location.reload()">다시 시도</button>
      </div>
    `;
  }

  function initRealtimeSync() {
    postService.subscribePosts(
      (posts) => {
        cachedAllPosts = posts;
        renderMemberFilterChips();
        renderFilteredGallery();
      },
      (error) => renderErrorMessage(error)
    );
  }

  // =========================================================
  // 5. 상세 보기 모달 & 본인 게시글 권한 제어
  // =========================================================
  function updateDetailModalActionButtons(post) {
    const currentUser = authService.getCurrentUser();
    const isAuthor = currentUser && post.authorId && post.authorId === currentUser.uid;

    btnDetailEdit.style.display = isAuthor ? 'inline-flex' : 'none';
    btnDetailDelete.style.display = isAuthor ? 'inline-flex' : 'none';
  }

  async function openDetailModal(postId) {
    try {
      const post = await postService.getPostById(postId);
      if (!post) {
        alert('게시글을 찾을 수 없습니다.');
        return;
      }

      currentDetailPost = post;
      detailTitle.textContent = post.title;
      detailAuthor.textContent = post.authorName || '익명 사용자';
      detailAuthor.title = post.authorEmail ? `이메일: ${post.authorEmail}` : '';

      detailDate.textContent = `📅 작성일: ${formatDate(post.createdAt)}` + 
        (post.updatedAt && post.updatedAt !== post.createdAt ? ` (수정일: ${formatDate(post.updatedAt)})` : '');
      detailContent.textContent = post.content;
      detailImage.referrerPolicy = 'no-referrer';
      detailImage.onerror = function() {
        this.onerror = null;
        this.src = 'images/default-landscape.jpg';
      };
      detailImage.src = post.imageUrl || (cloudinaryService ? cloudinaryService.defaultImage : 'images/default-landscape.jpg');
      detailImage.alt = post.title;

      updateDetailModalActionButtons(post);
      openModal(detailModal);
    } catch (error) {
      console.error('상세보기 실패:', error);
      alert('게시글을 불러오는데 실패했습니다: ' + error.message);
    }
  }

  // =========================================================
  // 6. 이미지 업로더 UI 및 파일 처리 로직
  // =========================================================
  function showDropzone() {
    uploadDropzone.style.display = 'flex';
    imagePreviewContainer.style.display = 'none';
    uploadProgressContainer.style.display = 'none';
    imagePreview.src = '';
    previewFilename.textContent = '';
  }

  function showPreview(imageSrc, filename = '선택된 이미지') {
    uploadDropzone.style.display = 'none';
    imagePreviewContainer.style.display = 'block';
    imagePreview.referrerPolicy = 'no-referrer';
    imagePreview.onerror = function() {
      this.onerror = null;
      this.src = 'images/default-landscape.jpg';
    };
    imagePreview.src = imageSrc;
    previewFilename.textContent = filename;
  }

  function resetImageUploader() {
    currentSelectedFile = null;
    currentExistingImageUrl = '';
    postImageFileInput.value = '';
    existingImageUrlInput.value = '';
    uploadProgressContainer.style.display = 'none';
    uploadProgressBar.style.width = '0%';
    uploadStatusText.textContent = '';
    showDropzone();
  }

  function handleFileSelected(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, GIF, WebP 등)만 선택할 수 있습니다.');
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert('파일 크기는 최대 10MB까지 가능합니다.');
      return;
    }

    currentSelectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      showPreview(e.target.result, file.name);
    };
    reader.readAsDataURL(file);
  }

  // =========================================================
  // 7. 작성 / 수정 모달 로직
  // =========================================================
  function handleCreateButtonClick() {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('게시글을 작성하려면 먼저 로그인해주세요.');
      openAuthModal('login');
      return;
    }
    openCreateModal();
  }

  function openCreateModal() {
    postForm.reset();
    postIdInput.value = '';
    formModalTitle.textContent = '새 게시글 작성';
    btnFormSubmit.textContent = '등록하기';
    resetImageUploader();
    openModal(formModal);
    postTitleInput.focus();
  }

  async function openEditModal(postId) {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('로그인이 필요한 기능입니다.');
      openAuthModal('login');
      return;
    }

    try {
      const post = await postService.getPostById(postId);
      if (!post) {
        alert('수정할 게시글을 찾을 수 없습니다.');
        return;
      }

      if (post.authorId && post.authorId !== currentUser.uid) {
        alert('본인이 작성한 게시글만 수정할 수 있습니다.');
        return;
      }

      closeModal(detailModal);

      postIdInput.value = post.id;
      postTitleInput.value = post.title;
      postContentInput.value = post.content;
      formModalTitle.textContent = '게시글 수정';
      btnFormSubmit.textContent = '수정 완료';

      resetImageUploader();

      if (post.imageUrl) {
        currentExistingImageUrl = post.imageUrl;
        existingImageUrlInput.value = post.imageUrl;
        showPreview(post.imageUrl, '기존 등록된 이미지');
      } else {
        showDropzone();
      }

      openModal(formModal);
      postTitleInput.focus();
    } catch (error) {
      console.error('수정 모달 로드 실패:', error);
      alert('수정 정보를 불러오지 못했습니다: ' + error.message);
    }
  }

  // 게시글 폼 제출 (Cloudinary 업로드 -> Firestore 저장)
  async function handlePostFormSubmit(event) {
    event.preventDefault();

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      openAuthModal('login');
      return;
    }

    const title = postTitleInput.value.trim();
    const content = postContentInput.value.trim();
    const editId = postIdInput.value;

    if (!title) {
      alert('제목을 입력해주세요.');
      postTitleInput.focus();
      return;
    }

    if (!content) {
      alert('내용을 입력해주세요.');
      postContentInput.focus();
      return;
    }

    try {
      btnFormSubmit.disabled = true;

      let finalImageUrl = currentExistingImageUrl || '';

      if (currentSelectedFile) {
        uploadProgressContainer.style.display = 'block';
        uploadProgressBar.style.width = '0%';
        uploadStatusText.textContent = 'Cloudinary에 이미지 업로드 중... 0%';
        btnFormSubmit.textContent = '이미지 업로드 중...';

        finalImageUrl = await cloudinaryService.uploadImage(currentSelectedFile, (percent) => {
          uploadProgressBar.style.width = `${percent}%`;
          uploadStatusText.textContent = `Cloudinary에 이미지 업로드 중... ${percent}%`;
        });
      }

      btnFormSubmit.textContent = editId ? '수정 내용 저장 중...' : '게시글 저장 중...';

      if (editId) {
        await postService.updatePost(editId, { 
          title, 
          content, 
          imageUrl: finalImageUrl || cloudinaryService.defaultImage 
        });
      } else {
        await postService.createPost({ 
          title, 
          content, 
          imageUrl: finalImageUrl || cloudinaryService.defaultImage 
        });
      }

      closeModal(formModal);
      postForm.reset();
      resetImageUploader();

      if (editId) {
        openDetailModal(editId);
      }
    } catch (error) {
      console.error('게시글 저장 실패:', error);
      uploadProgressContainer.style.display = 'none';
      alert('처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
      btnFormSubmit.disabled = false;
      btnFormSubmit.textContent = editId ? '수정 완료' : '등록하기';
    }
  }

  async function handleDeletePost(postId) {
    if (!postId) return;

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      openAuthModal('login');
      return;
    }

    if (currentDetailPost && currentDetailPost.authorId && currentDetailPost.authorId !== currentUser.uid) {
      alert('본인이 작성한 게시글만 삭제할 수 있습니다.');
      return;
    }

    const isConfirmed = confirm('정말 이 게시글을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.');
    if (!isConfirmed) return;

    try {
      btnDetailDelete.disabled = true;
      btnDetailDelete.textContent = '삭제 중...';
      await postService.deletePost(postId);
      closeModal(detailModal);
      currentDetailPost = null;
    } catch (error) {
      console.error('삭제 실패:', error);
      alert('게시글을 삭제하는 데 실패했습니다: ' + error.message);
    } finally {
      btnDetailDelete.disabled = false;
      btnDetailDelete.textContent = '삭제하기';
    }
  }

  // =========================================================
  // 8. 이벤트 리스너 등록
  // =========================================================
  function initEventListeners() {
    // 헤더 버튼
    btnOpenLogin?.addEventListener('click', () => openAuthModal('login'));
    btnOpenSignup?.addEventListener('click', () => openAuthModal('signup'));
    btnLogout?.addEventListener('click', handleLogout);
    btnOpenCreate?.addEventListener('click', handleCreateButtonClick);

    // 필터 초기화 버튼
    btnResetFilter?.addEventListener('click', () => applyFilter('all'));

    // 인증 모달 이벤트
    tabLogin?.addEventListener('click', () => setAuthMode('login'));
    tabSignup?.addEventListener('click', () => setAuthMode('signup'));
    authSwitchBtn?.addEventListener('click', () => {
      setAuthMode(currentAuthMode === 'login' ? 'signup' : 'login');
    });
    authForm?.addEventListener('submit', handleAuthSubmit);

    // 이미지 업로드 인터랙션 (드롭존 & 파일 선택)
    uploadDropzone?.addEventListener('click', () => postImageFileInput.click());
    btnChangeImage?.addEventListener('click', () => postImageFileInput.click());

    postImageFileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleFileSelected(file);
      }
    });

    // 드래그 앤 드롭 지원
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadDropzone?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadDropzone?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzone.classList.remove('dragover');
      });
    });

    uploadDropzone?.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files && dt.files[0];
      if (file) {
        handleFileSelected(file);
      }
    });

    btnRemoveImage?.addEventListener('click', () => {
      currentSelectedFile = null;
      currentExistingImageUrl = '';
      postImageFileInput.value = '';
      existingImageUrlInput.value = '';
      showDropzone();
    });

    // 갤러리 카드 및 작성자 클릭 이벤트 위임
    galleryGrid.addEventListener('click', (e) => {
      // 1. 작성자 이름 버튼 클릭 시 -> 해당 회원 사진 필터 적용!
      const authorBtn = e.target.closest('.card-author-btn');
      if (authorBtn) {
        e.stopPropagation();
        const authorId = authorBtn.dataset.filterAuthorId || null;
        const authorName = authorBtn.dataset.filterAuthorName;
        applyFilter('member', authorId, authorName);
        return;
      }

      // 2. 카드 본체 클릭 시 -> 상세 모달 오픈
      const card = e.target.closest('.gallery-card');
      if (card && card.dataset.postId) {
        openDetailModal(card.dataset.postId);
      }
    });

    galleryGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const card = e.target.closest('.gallery-card');
        if (card && card.dataset.postId) {
          openDetailModal(card.dataset.postId);
        }
      }
    });

    // 상세 모달 내 작성자 클릭 시에도 해당 회원 모아보기 지원
    detailAuthor?.addEventListener('click', () => {
      if (currentDetailPost) {
        closeModal(detailModal);
        applyFilter('member', currentDetailPost.authorId || null, currentDetailPost.authorName || '작성자');
      }
    });
    detailAuthor.style.cursor = 'pointer';
    detailAuthor.title = '클릭 시 이 작성자의 사진만 모아보기';

    // 상세 모달 내 수정 / 삭제
    btnDetailEdit?.addEventListener('click', () => {
      if (currentDetailPost) {
        openEditModal(currentDetailPost.id);
      }
    });

    btnDetailDelete?.addEventListener('click', () => {
      if (currentDetailPost) {
        handleDeletePost(currentDetailPost.id);
      }
    });

    // 작성/수정 폼 제출
    postForm.addEventListener('submit', handlePostFormSubmit);

    // 모달 닫기 버튼 공통
    document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => {
        const targetModalId = button.getAttribute('data-close-modal');
        const targetModal = document.getElementById(targetModalId);
        if (targetModal) closeModal(targetModal);
      });
    });

    // 배경 클릭 시 닫기
    [detailModal, formModal, authModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal);
        }
      });
    });

    // ESC 키 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-backdrop.active');
        if (activeModal) {
          closeModal(activeModal);
        }
      }
    });
  }

  // 초기화 실행
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    authService.onAuthStateChanged(handleAuthStateChanged);
    initRealtimeSync();
  });
})();
