/**
 * Cloudinary 이미지 업로드 서비스 모듈
 * 
 * Cloud Name: ybpqeq2p
 * Upload Preset: gallery_borad
 */
(function(window) {
  const CLOUD_NAME = 'ybpqeq2p';
  const UPLOAD_PRESET = 'gallery_borad';
  const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  // 이미지를 첨부하지 않았을 때 사용할 기본 감성 풍경 사진
  const DEFAULT_PLACEHOLDER_IMAGE = 'images/default-landscape.jpg';

  class CloudinaryService {
    constructor() {
      this.cloudName = CLOUD_NAME;
      this.uploadPreset = UPLOAD_PRESET;
      this.defaultImage = DEFAULT_PLACEHOLDER_IMAGE;
    }

    /**
     * 이미지 파일을 Cloudinary로 비동기 업로드 (진행률 콜백 지원)
     * @param {File} file 이미지 파일 객체
     * @param {Function} [onProgress] 진행률 콜백 (percent: 0~100)
     * @returns {Promise<string>} 업로드된 이미지의 secure_url
     */
    uploadImage(file, onProgress) {
      return new Promise((resolve, reject) => {
        if (!file) {
          resolve(this.defaultImage);
          return;
        }

        // 이미지 파일 형식 검증
        if (!file.type.startsWith('image/')) {
          reject(new Error('이미지 파일(JPG, PNG, GIF, WebP 등)만 업로드할 수 있습니다.'));
          return;
        }

        // 파일 크기 제한 (10MB)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          reject(new Error('파일 크기가 너무 큽니다. (최대 10MB까지 가능)'));
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.uploadPreset);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', UPLOAD_URL, true);

        // 진행률(Progress) 이벤트 리스너
        if (xhr.upload && typeof onProgress === 'function') {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              onProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.secure_url) {
                resolve(response.secure_url);
              } else {
                reject(new Error('Cloudinary 응답에서 이미지 URL을 찾을 수 없습니다.'));
              }
            } catch (err) {
              reject(new Error('Cloudinary 응답 파싱 실패: ' + err.message));
            }
          } else {
            let errorMsg = '이미지 업로드에 실패했습니다.';
            try {
              const errResp = JSON.parse(xhr.responseText);
              if (errResp.error && errResp.error.message) {
                errorMsg += ` (${errResp.error.message})`;
              }
            } catch (e) {
              errorMsg += ` (상태 코드: ${xhr.status})`;
            }
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          reject(new Error('네트워크 오류로 인해 Cloudinary 이미지 업로드에 실패했습니다.'));
        };

        xhr.send(formData);
      });
    }
  }

  window.cloudinaryService = new CloudinaryService();
})(window);
