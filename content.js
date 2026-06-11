// Configuration
// Note: API_URL is dynamically managed via popup settings and resolved in background.js.


function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const POST_CANDIDATE_SELECTOR = '[role="article"], div.x1a2a7pz';
const POST_MESSAGE_SELECTOR = '[data-ad-preview="message"], [data-ad-rendering-role="story_message"]';
const POST_MESSAGE_FALLBACK_SELECTOR = '.xdj266r.x14z9mp.xat24cr.x1lziwak';
const HIDE_TEXT_PATTERNS = /^(Ẩn bớt|See less)$/i;
const EXPAND_TEXT_PATTERNS = /^\s*(Xem thêm|See more)\s*$/i;
const NOISE_LINE_PATTERNS = [
  /^Facebook$/i,
  /^Bài viết của\b/i,
  /^Tất cả cảm xúc:?$/i,
  /^Phù hợp nhất$/i,
  /^Tác giả$/i,
  /^Tham gia$/i,
  /^Thích$/i,
  /^Bình luận$/i,
  /^Chia sẻ$/i,
  /^Xem thêm bình luận$/i,
  /^Xem thêm phản hồi$/i,
  /^Xem thêm câu trả lời$/i,
  /^Xem thêm tất cả$/i,
  /^Xem thêm$/i,
  /^See more$/i,
  /^See less$/i,
  /^Ẩn bớt$/i,
  /^\d+[.,]?\d*[KkMm]?$/,
  /^\d+\s*(ngày|giờ|phút|tuần|tháng|năm)$/i,
  /^\d+\s*(bình luận|lượt chia sẻ|lượt xem)$/i,
  /^\d+$/,
  /^[A-Za-zÀ-ỹ]$/,
  /^\s*·\s*$/,
];

function sendApiRequest(action, payload) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Môi trường Extension đã bị thay đổi/hủy. Vui lòng tải lại trang (F5).'));
        return;
      }

      chrome.runtime.sendMessage({ action, payload }, (response) => {
        let lastError = null;
        try {
          lastError = chrome.runtime.lastError;
        } catch (e) {
          // runtime context invalidated might throw on reading lastError
        }

        if (lastError) {
          reject(new Error(lastError.message || 'Lỗi extension runtime'));
          return;
        }

        if (!response) {
          reject(new Error('Không có phản hồi từ Background Script. Vui lòng thử lại.'));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || 'Yêu cầu thất bại'));
          return;
        }

        resolve(response.data);
      });
    } catch (err) {
      reject(new Error('Lỗi Extension: ' + err.message + '. Vui lòng tải lại trang (F5).'));
    }
  });
}

// Helper to hash post text for unique ID if no FB ID found
function hashString(str) {
  let hash = 0;
  if (str.length === 0) return 'no_id';
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'fb_' + Math.abs(hash).toString(16);
}

// Clone the post text node and strip hidden UI text like "See less".
function getRawText(postRoot) {
  let msgNode = postRoot.querySelector(POST_MESSAGE_SELECTOR);
  if (!msgNode) {
    const fallbackNodes = postRoot.querySelectorAll(POST_MESSAGE_FALLBACK_SELECTOR);
    let bestNode = null;
    let bestScore = 0;

    fallbackNodes.forEach((node) => {
      const text = (node.innerText || '').trim();
      if (text.length < 20) return;

      const noiseHits = NOISE_LINE_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
      const score = text.length - noiseHits * 100;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });

    msgNode = bestNode;
  }
  if (!msgNode) return '(Không tìm thấy text)';

  const clone = msgNode.cloneNode(true);
  document.body.appendChild(clone);

  const hideButtons = clone.querySelectorAll('[role="button"]');
  hideButtons.forEach((btn) => {
    const text = (btn.innerText || '').trim();
    if (HIDE_TEXT_PATTERNS.test(text)) {
      btn.remove();
    }
  });

  clone.querySelectorAll('*').forEach((node) => {
    if (node.offsetWidth === 0 || node.offsetHeight === 0) {
      node.remove();
    }
  });

  let txt = (clone.innerText || '').trim();
  clone.remove();

  let lines = txt.split(/\r?\n/);
  lines = lines.filter((line) => {
    const cleaned = line.trim();
    if (!cleaned) return false;
    if (HIDE_TEXT_PATTERNS.test(cleaned)) return false;
    return !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(cleaned));
  });
  txt = lines.join('\n').trim();
  return txt;
}

async function expandAndGetText(postRoot) {
  const seeMoreBtns = postRoot.querySelectorAll('[role="button"]');
  let clicked = false;

  seeMoreBtns.forEach((btn) => {
    const text = (btn.innerText || '').trim();
    if (EXPAND_TEXT_PATTERNS.test(text)) {
      btn.click();
      clicked = true;
    }
  });

  if (clicked) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return getRawText(postRoot);
}

// Try to extract Facebook post ID or generate hash
function getPostId(postElement, text) {
  const dataFt = postElement.querySelector('[data-ft]');
  if (dataFt) {
    const raw = dataFt.getAttribute('data-ft');
    if (raw) {
      try {
        const ft = JSON.parse(raw);
        if (ft.top_level_post_id) return ft.top_level_post_id;
        if (ft.post_id) return ft.post_id;
      } catch (err) {
        console.warn('FND: invalid data-ft JSON', err);
      }
    }
  }

  const rules = [
    /\/reel\/(\d+)/,
    /\/videos\/(\d+)/,
    /\/posts\/(\d+)/,
    /\/permalink\/(\d+)/,
    // /\/stories\/(\d+)/,
    /fbid=(\d{9,})/,
    /[?&]id=(\d{9,})/
  ];

  const links = postElement.querySelectorAll('a');
  for (let link of links) {
    let href = link.getAttribute('href') || '';
    if (!href) continue;

    if (href.includes('l.php?u=')) {
      try {
        href = decodeURIComponent(new URLSearchParams(href.split('?')[1]).get('u') || '');
      } catch (err) {
        console.warn('FND: failed to decode redirect link', err);
      }
    }

    for (let rule of rules) {
      const match = href.match(rule);
      if (match && match[1] && match[1].length >= 9) {
        return match[1];
      }
    }
  }

  return null;
}

function getQuickPredictionDisplay(slmLabel, slmConfidence) {
  const confidencePct = Math.round(slmConfidence * 100);
  const isFake = slmLabel === 1;

  if (!isFake) {
    if (confidencePct >= 90) return { label: 'Tin chính xác: Đáng tin cậy', chipClass: 'fnd-chip-real-high' };
    if (confidencePct >= 75) return { label: 'Tin chính xác: Khá tin cậy', chipClass: 'fnd-chip-real-medium' };
    if (confidencePct >= 60) return { label: 'Tin chính xác: Có cơ sở', chipClass: 'fnd-chip-real-low' };
    return { label: 'Tin chính xác: Cần xác minh thêm', chipClass: 'fnd-chip-warning' };
  }

  if (confidencePct >= 90) return { label: 'Tin sai lệch: Rất đáng ngờ', chipClass: 'fnd-chip-fake-high' };
  if (confidencePct >= 75) return { label: 'Tin sai lệch: Thiếu tin cậy', chipClass: 'fnd-chip-fake-medium' };
  if (confidencePct >= 60) return { label: 'Tin sai lệch: Có dấu hiệu sai sự thật', chipClass: 'fnd-chip-fake-low' };
  return { label: 'Tin sai lệch: Cần hết sức thận trọng', chipClass: 'fnd-chip-fake-warn' };
}

function buildEvidenceHtml(record) {
  let wikiHtml = '<p class="fnd-empty-state">Không tìm thấy thực thể.</p>';
  if (record.wiki_evidence && Object.keys(record.wiki_evidence).length > 0) {
    wikiHtml = Object.entries(record.wiki_evidence).map(([ent, def]) => `
      <div class="fnd-evidence-item">
        <strong class="fnd-evidence-entity">${ent}:</strong>
        <span class="fnd-evidence-text">${def}</span>
      </div>
    `).join('');
  }

  let newsHtml = '<p class="fnd-empty-state">Không có nguồn tin đối chiếu.</p>';
  if (record.rag_evidence && record.rag_evidence.length > 0) {
    newsHtml = record.rag_evidence.map(item => `
      <div class="fnd-evidence-item">
        <div class="fnd-evidence-title">${item.title}</div>
        <p class="fnd-evidence-text">"${item.chunk_text}"</p>
        <a href="${item.url}" target="_blank" class="fnd-evidence-link">Xem nguồn tin đối chiếu →</a>
      </div>
    `).join('');
  }

  return { wikiHtml, newsHtml };
}

function buildAnalysisPanel(record) {
  const slmIsFake = record.slm_label === 1;
  const llmIsFake = record.llm_label === 1;
  const isConflict = slmIsFake !== llmIsFake;

  const evaluationClass = isConflict ? 'fnd-evaluation-conflict' : 'fnd-evaluation-match';
  let evaluationText = '';

  if (isConflict) {
    const slmStr = slmIsFake ? 'sai lệch' : 'chính xác';
    const llmStr = llmIsFake ? 'sai lệch' : 'chính xác';
    evaluationText = `Bài viết có giọng điệu giống tin ${slmStr}, nhưng đối chiếu thực tế cho thấy đây là tin ${llmStr}. Bạn cần tự kiểm chứng lại để chắc chắn. Phân tích của AI có thể chưa hoàn hảo và cần được xem như một công cụ hỗ trợ, không phải là kết luận cuối cùng.`;
  } else {
    evaluationText = slmIsFake
      ? 'Cả hai phương pháp phân tích đều nhận định đây là tin SAI SỰ THẬT.'
      : 'Cả hai phương pháp phân tích đều nhận định đây là tin CHÍNH XÁC.';
  }

  const { wikiHtml, newsHtml } = buildEvidenceHtml(record);

  return `
    <div class="fnd-analysis-panel-head">
      <div class="fnd-panel-title-wrap">
        <span class="fnd-panel-title">🔍 Kết quả đối chiếu thông tin</span>
        <span class="fnd-chip ${evaluationClass}">${slmIsFake === llmIsFake ? 'Trùng khớp' : 'Chưa đồng nhất'}</span>
      </div>
      <button class="fnd-panel-close" type="button" data-fnd-action="collapse-analysis">Thu gọn</button>
    </div>
    <div class="fnd-analysis-panel-body">
      <div class="fnd-evaluation-conclusion ${evaluationClass}">
        ${evaluationText}
      </div>
      
      <div>
        <div class="fnd-section-title">Giải thích từ trợ lý AI:</div>
        <div class="fnd-explanation-box">
          ${record.llm_explanation || 'Không có giải thích cụ thể.'}
        </div>
      </div>
      
      <div>
        <div class="fnd-section-title">Thông tin liên quan trên Wikipedia:</div>
        <div class="fnd-evidence-list">
          ${wikiHtml}
        </div>
      </div>
      
      <div>
        <div class="fnd-section-title">Nguồn tin đối chiếu:</div>
        <div class="fnd-evidence-list">
          ${newsHtml}
        </div>
      </div>
    </div>
    <div class="fnd-analysis-panel-footer">
      Kết quả phân tích từ AI chỉ mang tính chất tham khảo, bạn vui lòng tự đối chiếu và kiểm tra thêm.
    </div>
  `;
}

function openAnalysisPanel(postElement, record) {
  const resultRow = postElement.querySelector('.fnd-result-bar');
  if (!resultRow) return;

  let panel = resultRow.querySelector('.fnd-analysis-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'fnd-analysis-panel';
    resultRow.appendChild(panel);
  }

  panel.innerHTML = buildAnalysisPanel(record);
  panel.classList.add('is-open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const collapseBtn = panel.querySelector('[data-fnd-action="collapse-analysis"]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      panel.classList.remove('is-open');
      panel.innerHTML = '';
    });
  }
}

// Perform Prediction & Analysis
async function checkPost(postElement, btnElement) {
  const text = await expandAndGetText(postElement);
  if (!text || text.length < 15) {
    alert('Nội dung bài viết quá ngắn hoặc không thể trích xuất.');
    return;
  }

  const fbPostId = getPostId(postElement, text);
  const postIdDisplay = fbPostId || 'N/A';

  btnElement.disabled = true;
  btnElement.innerText = 'Đang xử lý...';

  let resultRow = postElement.querySelector('.fnd-result-bar');
  if (!resultRow) {
    resultRow = document.createElement('div');
    resultRow.className = 'fnd-result-bar';
    postElement.insertBefore(resultRow, postElement.firstChild);
  }

  resultRow.innerHTML = `
    <div class="fnd-result-top">
      <span style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="fnd-chip fnd-chip-neutral">🤖 Đang kiểm tra văn phong...</span>
      </span>
      <span class="fnd-chip fnd-chip-info">
        <span class="fnd-spinner"></span> Đang xử lý...
      </span>
    </div>
    <div class="fnd-analysis-panel" aria-hidden="true"></div>
  `;

  try {
    const predData = await sendApiRequest('predict', {
      text,
      fb_post_id: fbPostId || null
    });
    const quickDisplay = getQuickPredictionDisplay(predData.slm_label, predData.slm_confidence);

    let xgbRowHtml = '';
    if (predData.xgboost_label !== undefined && predData.xgboost_label !== null) {
      const xgbDisplay = getQuickPredictionDisplay(predData.xgboost_label, predData.xgboost_confidence);
      xgbRowHtml = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%;">
          <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; min-width: 90px;">Dự đoán XGB:</span>
          <span class="fnd-chip ${xgbDisplay.chipClass}">
            ${xgbDisplay.label}
          </span>
          <span style="font-size: 11.5px; color: #475569;">
            Độ tin cậy: <strong style="color: #0f172a; font-weight: 700;">${(predData.xgboost_confidence * 100).toFixed(0)}%</strong>
          </span>
        </div>
      `;
    }

    resultRow.innerHTML = `
      <div class="fnd-result-top" style="flex-direction: column !important; align-items: flex-start !important; gap: 8px !important;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%;">
          <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; min-width: 90px;">Dự đoán SLM:</span>
          <span class="fnd-chip ${quickDisplay.chipClass}">
            ${quickDisplay.label}
          </span>
          <span style="font-size: 11.5px; color: #475569;">
            Độ tin cậy: <strong style="color: #0f172a; font-weight: 700;">${(predData.slm_confidence * 100).toFixed(0)}%</strong>
          </span>
        </div>
        ${xgbRowHtml}
        <div style="width: 100%; display: flex; justify-content: flex-end; margin-top: 4px;">
          <button class="fnd-action-link" type="button">Tìm kiếm & đối chiếu thực tế</button>
        </div>
      </div>
      <div class="fnd-analysis-panel" aria-hidden="true"></div>
    `;

    // Attach event listener to the analyze button scoped to this resultRow
    const analyzeBtn = resultRow.querySelector('.fnd-action-link');

    if (analyzeBtn) {
      console.log('FND: Attaching analyze click listener for post ID:', fbPostId);

      let stepperInterval = null;

      analyzeBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('FND: analyze clicked for post ID:', fbPostId);

        analyzeBtn.setAttribute('disabled', 'true');
        analyzeBtn.textContent = 'Đang đối chiếu...';

        const loadingPanel = resultRow.querySelector('.fnd-analysis-panel');
        if (loadingPanel) {
          loadingPanel.classList.add('is-open');
          loadingPanel.innerHTML = `
            <div class="fnd-analysis-panel-head">
              <div class="fnd-panel-title-wrap">
                <span class="fnd-panel-title">🔍 Tìm kiếm & đối chiếu thực tế</span>
                <span class="fnd-chip fnd-chip-warning">Đang xử lý</span>
              </div>
            </div>
            <div class="fnd-analysis-panel-body">
              <div class="fnd-stepper-container">
                <div class="fnd-stepper-header">
                  <span class="fnd-spinner"></span>
                  <div>
                    <div class="fnd-stepper-title">Hệ thống đang tìm kiếm & đối chiếu...</div>
                    <div class="fnd-stepper-subtitle">Đang tra cứu từ Wikipedia và báo chí trực tuyến để xác minh bài viết</div>
                  </div>
                </div>
                <div class="fnd-stepper-list">
                  <div class="fnd-step-item" data-fnd-step="1">
                    <div class="fnd-step-icon">1</div>
                    <span class="fnd-step-label">Đọc nội dung bài viết và phân tích từ khóa chính</span>
                  </div>
                  <div class="fnd-step-item" data-fnd-step="2">
                    <div class="fnd-step-icon">2</div>
                    <span class="fnd-step-label">Tìm kiếm các thông tin và bài viết liên quan trên Internet</span>
                  </div>
                  <div class="fnd-step-item" data-fnd-step="3">
                    <div class="fnd-step-icon">3</div>
                    <span class="fnd-step-label">So sánh nội dung với các nguồn tin chính thống uy tín</span>
                  </div>
                  <div class="fnd-step-item" data-fnd-step="4">
                    <div class="fnd-step-icon">4</div>
                    <span class="fnd-step-label">Tổng hợp bằng chứng để đưa ra kết luận</span>
                  </div>
                </div>
              </div>
            </div>
          `;

          const updateStepper = (step) => {
            for (let i = 1; i <= 4; i++) {
              const el = loadingPanel.querySelector(`[data-fnd-step="${i}"]`);
              if (!el) continue;
              el.className = 'fnd-step-item';
              const icon = el.querySelector('.fnd-step-icon');
              if (i < step) {
                el.classList.add('completed');
                if (icon) icon.textContent = '✓';
              } else if (i === step) {
                el.classList.add('active');
                if (icon) icon.textContent = i.toString();
              } else {
                if (icon) icon.textContent = i.toString();
              }
            }
          };

          let loadingStep = 1;
          updateStepper(loadingStep);

          if (stepperInterval) clearInterval(stepperInterval);
          stepperInterval = setInterval(() => {
            if (loadingStep < 4) {
              loadingStep++;
              updateStepper(loadingStep);
            }
          }, 4000);
        }

        try {
          const analyzeData = await sendApiRequest('analyze', {
            text,
            fb_post_id: fbPostId || null,
            record_id: predData ? predData.record_id : null
          });

          if (stepperInterval) {
            clearInterval(stepperInterval);
            stepperInterval = null;
          }

          openAnalysisPanel(postElement, analyzeData);
          analyzeBtn.textContent = 'Xem bằng chứng đối chiếu';
          analyzeBtn.removeAttribute('disabled');
        } catch (error) {
          if (stepperInterval) {
            clearInterval(stepperInterval);
            stepperInterval = null;
          }
          console.error('FND: analyze API call failed:', error);
          analyzeBtn.textContent = 'Đối chiếu thất bại';
          analyzeBtn.removeAttribute('disabled');

          if (loadingPanel) {
            loadingPanel.innerHTML = `
              <div class="fnd-analysis-panel-head">
                <div class="fnd-panel-title-wrap">
                  <span class="fnd-panel-title">🔍 Tìm kiếm & đối chiếu thực tế</span>
                  <span class="fnd-chip fnd-chip-fake">❌ Thất bại</span>
                </div>
                <button class="fnd-panel-close" type="button" data-fnd-action="collapse-analysis">Đóng</button>
              </div>
              <div class="fnd-analysis-panel-body">
                <div class="fnd-error-box">
                  <div class="fnd-error-title">
                    <span>⚠️</span>
                    <span>Không thể đối chiếu thông tin thực tế</span>
                  </div>
                  <div class="fnd-error-text">${escapeHtml(error.message || 'Lỗi hệ thống khi phân tích.')}</div>
                  <div class="fnd-error-desc">Lỗi này có thể xảy ra do sự cố tạm thời của mô hình ngôn ngữ lớn (LLM) hoặc chính sách giới hạn API. Bạn có thể bấm nút bên dưới để thử lại.</div>
                  <button class="fnd-retry-btn" type="button">🔄 Thử lại đối chiếu</button>
                </div>
              </div>
            `;

            // Bind close button
            const collapseBtn = loadingPanel.querySelector('[data-fnd-action="collapse-analysis"]');
            if (collapseBtn) {
              collapseBtn.addEventListener('click', () => {
                loadingPanel.classList.remove('is-open');
                loadingPanel.innerHTML = '';
                analyzeBtn.textContent = 'Tìm kiếm & đối chiếu thực tế';
              });
            }

            // Bind retry button
            const retryBtn = loadingPanel.querySelector('.fnd-retry-btn');
            if (retryBtn) {
              retryBtn.addEventListener('click', (retryEv) => {
                retryEv.preventDefault();
                retryEv.stopPropagation();
                // Click the original analyzeBtn again to restart
                analyzeBtn.click();
              });
            }
          }
        }
      });
    } else {
      console.warn('FND: Scoped analyze button not found in resultRow');
    }
  } catch (err) {
    console.error(err);
    resultRow.innerHTML = `<span class="fnd-chip fnd-chip-fake">❌ Lỗi: ${err.message || 'Lỗi kết nối máy chủ'}</span>`;
  } finally {
    btnElement.disabled = false;
    btnElement.innerText = 'Kiểm tra tin';
  }
}

// Inject button into a Facebook post element
function injectButton(postElement, postUniqueId) {
  // Check if button is already injected in this post
  if (postElement.classList.contains('fnd-processed') || postElement.querySelector('.fnd-inject-container')) return;

  const shareButton = postElement.querySelector('[data-ad-rendering-role="share_button"]');
  if (!shareButton) return;

  postElement.classList.add('fnd-processed');
  postElement.setAttribute('data-fnd-post-id', postUniqueId);

  const container = document.createElement('div');
  container.className = 'fnd-inject-container';

  const button = document.createElement('button');
  button.className = 'fnd-inject-btn';
  button.innerText = '🔍 Kiểm tra tin';

  const idText = document.createElement('span');
  idText.className = 'fnd-post-id-small';
  idText.innerText = `ID: ${postUniqueId}`;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    checkPost(postElement, button);
  });

  container.appendChild(button);
  container.appendChild(idText);

  try {
    postElement.prepend(container);
  } catch (err) {
    console.error('FND: Failed to inject button container into post root.', err);
    postElement.appendChild(container);
  }
}

// // Monitor Facebook feed changes
// function processPosts() {
//   const candidates = document.querySelectorAll(POST_CANDIDATE_SELECTOR);
//   candidates.forEach((root) => {
//     if (root.closest('[role="button"]')) return;

//     // Quick extract message text to build unique post signature
//     let msgNode = root.querySelector(POST_MESSAGE_SELECTOR);
//     if (!msgNode) {
//       const fallbackNodes = root.querySelectorAll(POST_MESSAGE_FALLBACK_SELECTOR);
//       let maxLen = 0;
//       fallbackNodes.forEach(node => {
//         const len = (node.innerText || '').trim().length;
//         if (len > maxLen) {
//           maxLen = len;
//           msgNode = node;
//         }
//       });
//     }

//     const msgText = msgNode ? (msgNode.innerText || '').trim() : '';
//     if (!msgText && (root.innerText || '').length <= 50) return;

//     const fbPostId = getPostId(root, msgText);
//     const postUniqueId = fbPostId
//       ? fbPostId
//       : hashString(msgText.substring(0, 200));

//     // Check if the DOM node was recycled by Facebook for a new post
//     const processedId = root.getAttribute('data-fnd-post-id');
//     if (processedId) {
//       if (processedId === postUniqueId) {
//         return; // Already processed and content matches
//       } else {
//         // Element was recycled, reset state and clean up injected elements
//         console.log('FND: Resetting recycled post node. Old ID:', processedId, 'New ID:', postUniqueId);
//         root.classList.remove('fnd-processed');
//         const oldBtn = root.querySelector('.fnd-inject-container');
//         if (oldBtn) oldBtn.remove();
//         const oldResult = root.querySelector('.fnd-result-bar');
//         if (oldResult) oldResult.remove();
//         root.removeAttribute('data-fnd-post-id');
//       }
//     }

//     if (!root.querySelector('[data-ad-rendering-role="share_button"]')) return;

//     injectButton(root, postUniqueId);
//   });
// }

// Monitor Facebook feed changes
function processPosts() {
  const candidates = document.querySelectorAll(POST_CANDIDATE_SELECTOR);
  candidates.forEach((root) => {
    if (root.closest('[role="button"]')) return;

    // =========================================================================
    // RULE CẬP NHẬT: Chỉ giữ khối 'dialog' bọc trên cùng, bỏ qua khối con bên trong
    // =========================================================================
    // Nếu khối này KHÔNG PHẢI là dialog, nhưng lại NẰM TRONG một thẻ dialog khác -> Bỏ qua
    if (root.getAttribute('role') !== 'dialog' && root.closest('[role="dialog"]')) return;
    // =========================================================================

    // Quick extract message text to build unique post signature
    let msgNode = root.querySelector(POST_MESSAGE_SELECTOR);
    if (!msgNode) {
      const fallbackNodes = root.querySelectorAll(POST_MESSAGE_FALLBACK_SELECTOR);
      let maxLen = 0;
      fallbackNodes.forEach(node => {
        const len = (node.innerText || '').trim().length;
        if (len > maxLen) {
          maxLen = len;
          msgNode = node;
        }
      });
    }

    const msgText = msgNode ? (msgNode.innerText || '').trim() : '';
    if (!msgText && (root.innerText || '').length <= 50) return;

    const fbPostId = getPostId(root, msgText);
    const postUniqueId = fbPostId
      ? fbPostId
      : hashString(msgText.substring(0, 200));

    // Check if the DOM node was recycled by Facebook for a new post
    const processedId = root.getAttribute('data-fnd-post-id');
    if (processedId) {
      const storedPrefix = root.getAttribute('data-fnd-text-prefix');
      if (storedPrefix && msgText.includes(storedPrefix)) {
        return; // Same post (potentially expanded), do not reset
      }

      if (processedId === postUniqueId) {
        return; // Already processed and content matches
      } else {
        // Element was recycled, reset state and clean up injected elements
        console.log('FND: Resetting recycled post node. Old ID:', processedId, 'New ID:', postUniqueId);
        root.classList.remove('fnd-processed');
        const oldBtn = root.querySelector('.fnd-inject-container');
        if (oldBtn) oldBtn.remove();
        const oldResult = root.querySelector('.fnd-result-bar');
        if (oldResult) oldResult.remove();
        root.removeAttribute('data-fnd-post-id');
        root.removeAttribute('data-fnd-text-prefix');
      }
    }

    if (!root.querySelector('[data-ad-rendering-role="share_button"]')) return;

    injectButton(root, postUniqueId);
    
    // Store text prefix to identify post even after clicking "See more"
    const textPrefix = msgText.substring(0, 30).trim();
    root.setAttribute('data-fnd-text-prefix', textPrefix);
  });
}

function observeFeed() {
  const observer = new MutationObserver(() => {
    processPosts();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  processPosts();
}

// Start
console.log("Fake News Detection System Extension Loaded.");
observeFeed();
