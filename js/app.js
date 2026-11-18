/**
 * 갤러리 보드 메인 애플리케이션 로직
 * - Firebase Firestore, Firebase Authentication, Cloudinary 연동
 * - 회원별 사진 모아보기 필터
 * - 사진 여러 장 첨부 및 대표 이미지(커버 사진) 설정 기능 통합
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
  const memberFilterDropdown = document.getElementById('member-filter-dropdown');
  const btnToggleMemberFilter = document.getElementById('btn-toggle-member-filter');
  const currentFilterLabel = document.getElementById('current-filter-label');
  const memberFilterMenu = document.getElementById('member-filter-menu');
  const btnCloseFilterMenu = document.getElementById('btn-close-filter-menu');
  const memberFilterChips = document.getElementById('member-filter-chips');
  const activeFilterName = document.getElementById('active-filter-name');
  const btnResetFilter = document.getElementById('btn-reset-filter');

  // DOM 요소 캐싱 - 상세 모달
  const detailModal = document.getElementById('detail-modal');
  const detailTitle = document.getElementById('detail-title');
  const detailAuthor = document.getElementById('detail-author');
  const detailDate = document.getElementById('detail-date');
  const detailContent = document.getElementById('detail-content');
  const detailImage = document.getElementById('detail-image');
  const detailThumbnailsBar = document.getElementById('detail-thumbnails-bar');
  const btnDetailEdit = document.getElementById('btn-detail-edit');
  const btnDetailDelete = document.getElementById('btn-detail-delete');

  // DOM 요소 캐싱 - 작성/수정 모달 & 다중 이미지 업로더
  const formModal = document.getElementById('form-modal');
  const postForm = document.getElementById('post-form');
  const formModalTitle = document.getElementById('form-modal-title');
  const postIdInput = document.getElementById('post-id');
  const postTitleInput = document.getElementById('post-title');
  const postContentInput = document.getElementById('post-content');
  const postImageFileInput = document.getElementById('post-image-file');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const multiPreviewSection = document.getElementById('multi-preview-section');
  const attachedPhotosCount = document.getElementById('attached-photos-count');
  const btnAddMorePhotos = document.getElementById('btn-add-more-photos');
  const multiPreviewGrid = document.getElementById('multi-preview-grid');
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

  // 첨부된 다중 이미지 상태 배열: [ { id, file: File|null, previewUrl: string, isCover: boolean } ]
  let attachedImages = [];

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
      if (currentFilter.type === 'my') {
        applyFilter('all');
      }
    }

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
  // 3. 회원별 사진 모아보기 필터 드롭다운 로직
  // =========================================================

  function toggleFilterDropdown(forceState) {
    if (!memberFilterDropdown) return;
    const shouldOpen = typeof forceState === 'boolean' 
      ? forceState 
      : !memberFilterDropdown.classList.contains('open');

    if (shouldOpen) {
      memberFilterDropdown.classList.add('open');
      btnToggleMemberFilter?.setAttribute('aria-expanded', 'true');
    } else {
      memberFilterDropdown.classList.remove('open');
      btnToggleMemberFilter?.setAttribute('aria-expanded', 'false');
    }
  }

  function applyFilter(type, id = null, name = '전체') {
    currentFilter = { type, id, name };

    if (type === 'all') {
      if (btnResetFilter) btnResetFilter.style.display = 'none';
      if (currentFilterLabel) currentFilterLabel.textContent = '회원별 모아보기';
    } else if (type === 'my') {
      if (btnResetFilter) btnResetFilter.style.display = 'inline-flex';
      if (activeFilterName) activeFilterName.textContent = '내 사진';
      if (currentFilterLabel) currentFilterLabel.textContent = '⭐ 내 사진';
    } else {
      if (btnResetFilter) btnResetFilter.style.display = 'inline-flex';
      if (activeFilterName) activeFilterName.textContent = name;
      if (currentFilterLabel) currentFilterLabel.textContent = `👤 ${name}`;
    }

    toggleFilterDropdown(false);
    renderMemberFilterChips();
    renderFilteredGallery();
  }

  function renderMemberFilterChips() {
    if (!memberFilterChips) return;

    const currentUser = authService.getCurrentUser();
    const totalCount = cachedAllPosts.length;

    const memberMap = new Map();
    let myCount = 0;

    cachedAllPosts.forEach(post => {
      if (currentUser && post.authorId && post.authorId === currentUser.uid) {
        myCount++;
      }

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

    let listHtml = `
      <button type="button" class="filter-menu-item ${currentFilter.type === 'all' ? 'active' : ''}" data-filter-type="all">
        <span>📁 전체 사진 보기</span>
        <span class="item-badge">${totalCount}</span>
      </button>
    `;

    if (currentUser && myCount > 0) {
      listHtml += `
        <button type="button" class="filter-menu-item item-my ${currentFilter.type === 'my' ? 'active' : ''}" data-filter-type="my">
          <span>⭐ 내 사진 모아보기</span>
          <span class="item-badge">${myCount}</span>
        </button>
      `;
    }

    members.forEach(member => {
      const isMyKey = currentUser && member.id && member.id === currentUser.uid;
      const isCurrentActive = currentFilter.type === 'member' && 
        ((member.id && currentFilter.id === member.id) || (!member.id && currentFilter.name === member.name));

      listHtml += `
        <button type="button" class="filter-menu-item ${isCurrentActive ? 'active' : ''}" 
                data-filter-type="member" 
                data-member-id="${member.id || ''}" 
                data-member-name="${escapeHtml(member.name)}">
          <span>👤 ${escapeHtml(member.name)}${isMyKey ? ' (나)' : ''}</span>
          <span class="item-badge">${member.count}</span>
        </button>
      `;
    });

    memberFilterChips.innerHTML = listHtml;

    // 아이템 클릭 이벤트 바인딩
    memberFilterChips.querySelectorAll('.filter-menu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.filterType;
        if (type === 'all') {
          applyFilter('all');
        } else if (type === 'my') {
          applyFilter('my', currentUser.uid, '내 사진');
        } else if (type === 'member') {
          const id = btn.dataset.memberId || null;
          const name = btn.dataset.memberName;
          applyFilter('member', id, name);
        }
      });
    });
  }

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
  // 4. 갤러리 목록 렌더링 (대표 이미지 + 사진 장수 뱃지)
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
      const displayCoverUrl = post.imageUrl || (cloudinaryService ? cloudinaryService.defaultImage : 'images/default-landscape.jpg');
      const photoCount = Array.isArray(post.images) && post.images.length > 0 ? post.images.length : 1;

      return `
        <article class="gallery-card" data-post-id="${post.id}" tabindex="0" role="button" aria-label="${escapeHtml(post.title)} 상세보기">
          <div class="card-thumbnail-wrapper">
            <!-- 사진 여러 장일 경우 장수 뱃지 표시 -->
            ${photoCount > 1 ? `<div class="card-photos-badge">📷 ${photoCount}장</div>` : ''}
            <img class="card-thumbnail" 
                 src="${escapeHtml(displayCoverUrl)}" 
                 alt="${escapeHtml(post.title)}" 
                 loading="lazy" 
                 referrerpolicy="no-referrer"
                 onerror="this.onerror=null; this.src='images/default-landscape.jpg';">
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(post.title)}</h3>
            <p class="card-excerpt">${escapeHtml(excerpt)}</p>
            <div class="card-footer">
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
  // 5. 상세 보기 모달 (대표 이미지 + 다중 썸네일 스트립 네비게이션)
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

      // 대표 이미지 또는 첫 번째 이미지 설정
      const mainImgUrl = post.imageUrl || (post.images && post.images[0]) || cloudinaryService.defaultImage;
      detailImage.referrerPolicy = 'no-referrer';
      detailImage.onerror = function() {
        this.onerror = null;
        this.src = 'images/default-landscape.jpg';
      };
      detailImage.src = mainImgUrl;
      detailImage.alt = post.title;

      // 다중 이미지 썸네일 스트립 구성
      const imagesList = Array.isArray(post.images) && post.images.length > 0 
        ? post.images 
        : [mainImgUrl];

      if (imagesList.length > 1) {
        detailThumbnailsBar.style.display = 'flex';
        detailThumbnailsBar.innerHTML = imagesList.map((imgUrl, idx) => {
          const isCurrentActive = imgUrl === mainImgUrl;
          return `
            <div class="detail-thumb-item ${isCurrentActive ? 'active' : ''}" data-thumb-url="${escapeHtml(imgUrl)}">
              <img src="${escapeHtml(imgUrl)}" alt="사진 ${idx + 1}" onerror="this.src='images/default-landscape.jpg';">
            </div>
          `;
        }).join('');

        // 썸네일 클릭 시 메인 이미지 전환 이벤트 바인딩
        detailThumbnailsBar.querySelectorAll('.detail-thumb-item').forEach(thumb => {
          thumb.addEventListener('click', () => {
            detailThumbnailsBar.querySelectorAll('.detail-thumb-item').forEach(el => el.classList.remove('active'));
            thumb.classList.add('active');
            detailImage.src = thumb.dataset.thumbUrl;
          });
        });
      } else {
        detailThumbnailsBar.style.display = 'none';
        detailThumbnailsBar.innerHTML = '';
      }

      updateDetailModalActionButtons(post);
      openModal(detailModal);
    } catch (error) {
      console.error('상세보기 실패:', error);
      alert('게시글을 불러오는데 실패했습니다: ' + error.message);
    }
  }

  // =========================================================
  // 6. 다중 이미지 업로더 & 대표 사진 설정 UI 로직
  // =========================================================

  function resetImageUploader() {
    attachedImages = [];
    postImageFileInput.value = '';
    uploadProgressContainer.style.display = 'none';
    uploadProgressBar.style.width = '0%';
    uploadStatusText.textContent = '';
    updateMultiPreviewUI();
  }

  /**
   * 다중 이미지 미리보기 영역 렌더링
   */
  function updateMultiPreviewUI() {
    const totalCount = attachedImages.length;
    attachedPhotosCount.textContent = totalCount;

    if (totalCount === 0) {
      uploadDropzone.style.display = 'flex';
      multiPreviewSection.style.display = 'none';
      multiPreviewGrid.innerHTML = '';
      return;
    }

    uploadDropzone.style.display = 'none';
    multiPreviewSection.style.display = 'block';

    // 대표 이미지가 하나도 지정되지 않았다면 첫 번째 사진을 대표 이미지로 지정
    const hasCover = attachedImages.some(img => img.isCover);
    if (!hasCover && attachedImages.length > 0) {
      attachedImages[0].isCover = true;
    }

    multiPreviewGrid.innerHTML = attachedImages.map((item, index) => {
      return `
        <div class="preview-card ${item.isCover ? 'is-cover' : ''}" data-index="${index}">
          ${item.isCover ? '<span class="cover-badge">★ 대표 이미지</span>' : ''}
          <button type="button" class="btn-card-remove" data-remove-index="${index}" title="사진 삭제">&times;</button>
          <img src="${escapeHtml(item.previewUrl)}" alt="첨부 사진 ${index + 1}" onerror="this.src='images/default-landscape.jpg';">
          <button type="button" class="btn-set-cover" data-cover-index="${index}">대표로 설정</button>
        </div>
      `;
    }).join('');

    // 이벤트 바인딩: 카드 클릭 시 또는 '대표로 설정' 클릭 시 대표 이미지 지정
    multiPreviewGrid.querySelectorAll('.preview-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 삭제 버튼 클릭은 제외
        if (e.target.closest('.btn-card-remove')) return;

        const idx = parseInt(card.dataset.index, 10);
        setCoverImage(idx);
      });
    });

    // 개별 사진 삭제 버튼 바인딩
    multiPreviewGrid.querySelectorAll('.btn-card-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.removeIndex, 10);
        removeAttachedImage(idx);
      });
    });
  }

  /**
   * 대표 이미지 지정
   */
  function setCoverImage(index) {
    if (index < 0 || index >= attachedImages.length) return;
    attachedImages.forEach((img, i) => {
      img.isCover = (i === index);
    });
    updateMultiPreviewUI();
  }

  /**
   * 첨부 이미지 삭제
   */
  function removeAttachedImage(index) {
    if (index < 0 || index >= attachedImages.length) return;
    const wasCover = attachedImages[index].isCover;
    attachedImages.splice(index, 1);

    // 대표 이미지를 삭제했다면 첫 번째 남은 사진을 대표로 지정
    if (wasCover && attachedImages.length > 0) {
      attachedImages[0].isCover = true;
    }

    updateMultiPreviewUI();
  }

  /**
   * 파일 선택 처리 (다중 파일)
   */
  function handleFilesSelected(fileList) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const validFiles = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        alert(`'${file.name}'은(는) 이미지 파일이 아닙니다.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`'${file.name}' 파일이 너무 큽니다. (최대 10MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    let loadedCount = 0;
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        attachedImages.push({
          id: 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          file: file,
          previewUrl: e.target.result,
          isCover: attachedImages.length === 0 // 첫 번째 사진이면 자동으로 대표 이미지
        });

        loadedCount++;
        if (loadedCount === validFiles.length) {
          updateMultiPreviewUI();
        }
      };
      reader.readAsDataURL(file);
    });
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

      // 기존 등록된 다중 이미지 불러오기
      const existingList = Array.isArray(post.images) && post.images.length > 0 
        ? post.images 
        : (post.imageUrl ? [post.imageUrl] : []);

      if (existingList.length > 0) {
        const coverTarget = post.imageUrl || existingList[0];
        attachedImages = existingList.map((url, idx) => ({
          id: 'exist_' + idx + '_' + Math.random().toString(36).substr(2, 5),
          file: null, // 이미 업로드되어 있는 URL
          previewUrl: url,
          isCover: (url === coverTarget) || (idx === 0)
        }));
        updateMultiPreviewUI();
      }

      openModal(formModal);
      postTitleInput.focus();
    } catch (error) {
      console.error('수정 모달 로드 실패:', error);
      alert('수정 정보를 불러오지 못했습니다: ' + error.message);
    }
  }

  // 게시글 폼 제출 (Cloudinary 다중 업로드 -> Firestore 저장)
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

      const finalUrls = [];
      let finalCoverUrl = '';

      // 1. 이미지가 첨부되지 않은 경우 -> 기본 감성 풍경 사진 적용
      if (attachedImages.length === 0) {
        finalCoverUrl = cloudinaryService.defaultImage;
        finalUrls.push(finalCoverUrl);
      } else {
        // 2. 이미지가 첨부되어 있는 경우: 새 파일 업로드 진행
        const newFilesToUpload = attachedImages.filter(item => item.file !== null);

        if (newFilesToUpload.length > 0) {
          uploadProgressContainer.style.display = 'block';
          uploadProgressBar.style.width = '0%';
          uploadStatusText.textContent = `Cloudinary에 사진 업로드 중... 0% (총 ${newFilesToUpload.length}장)`;
          btnFormSubmit.textContent = '사진 업로드 중...';

          for (let i = 0; i < attachedImages.length; i++) {
            const item = attachedImages[i];
            if (item.file) {
              const uploadedUrl = await cloudinaryService.uploadImage(item.file, (singlePercent) => {
                const overall = Math.round(((i + (singlePercent / 100)) / attachedImages.length) * 100);
                uploadProgressBar.style.width = `${overall}%`;
                uploadStatusText.textContent = `Cloudinary 업로드 중... ${overall}% (${i + 1}/${attachedImages.length})`;
              });
              item.previewUrl = uploadedUrl;
              item.file = null; // 업로드 완료
            }
          }
        }

        // 전체 URL 배열 구성 및 대표 이미지 추출
        attachedImages.forEach(item => {
          finalUrls.push(item.previewUrl);
          if (item.isCover) {
            finalCoverUrl = item.previewUrl;
          }
        });

        // 대표 이미지가 지정되지 않았으면 첫 번째 사진을 대표로 지정
        if (!finalCoverUrl && finalUrls.length > 0) {
          finalCoverUrl = finalUrls[0];
        }
      }

      btnFormSubmit.textContent = editId ? '수정 내용 저장 중...' : '게시글 저장 중...';

      // 3. Firestore에 대표 이미지 및 다중 사진 배열 저장
      if (editId) {
        await postService.updatePost(editId, { 
          title, 
          content, 
          imageUrl: finalCoverUrl,
          images: finalUrls
        });
      } else {
        await postService.createPost({ 
          title, 
          content, 
          imageUrl: finalCoverUrl,
          images: finalUrls
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

    // 회원별 모아보기 드롭다운 토글 및 닫기
    btnToggleMemberFilter?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFilterDropdown();
    });

    btnCloseFilterMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFilterDropdown(false);
    });

    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (memberFilterDropdown && !memberFilterDropdown.contains(e.target)) {
        toggleFilterDropdown(false);
      }
    });

    // 필터 초기화 버튼
    btnResetFilter?.addEventListener('click', () => applyFilter('all'));

    // 인증 모달 이벤트
    tabLogin?.addEventListener('click', () => setAuthMode('login'));
    tabSignup?.addEventListener('click', () => setAuthMode('signup'));
    authSwitchBtn?.addEventListener('click', () => {
      setAuthMode(currentAuthMode === 'login' ? 'signup' : 'login');
    });
    authForm?.addEventListener('submit', handleAuthSubmit);

    // 다중 이미지 업로드 인터랙션 (드롭존 & 파일 선택)
    uploadDropzone?.addEventListener('click', () => postImageFileInput.click());
    btnAddMorePhotos?.addEventListener('click', () => postImageFileInput.click());

    postImageFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
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
      if (dt.files && dt.files.length > 0) {
        handleFilesSelected(dt.files);
      }
    });

    // 갤러리 카드 및 작성자 클릭 이벤트 위임
    galleryGrid.addEventListener('click', (e) => {
      const authorBtn = e.target.closest('.card-author-btn');
      if (authorBtn) {
        e.stopPropagation();
        const authorId = authorBtn.dataset.filterAuthorId || null;
        const authorName = authorBtn.dataset.filterAuthorName;
        applyFilter('member', authorId, authorName);
        return;
      }

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

    // 상세 모달 내 작성자 클릭 시 해당 회원 모아보기 지원
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
        toggleFilterDropdown(false);
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
