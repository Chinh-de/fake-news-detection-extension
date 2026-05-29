const API_URL = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusIndicator = document.getElementById('backend-status');
  const newsInput = document.getElementById('news-input');
  const btnPredict = document.getElementById('btn-predict');
  const btnAnalyze = document.getElementById('btn-analyze');
  const loadingSpinner = document.getElementById('loading-spinner');
  const loadingText = document.getElementById('loading-text');
  const errorMessage = document.getElementById('error-message');
  const resultsPanel = document.getElementById('results-panel');
  const simpleLoading = document.getElementById('simple-loading');
  const stepperLoading = document.getElementById('stepper-loading');
  let stepperInterval = null;

  // Cards & Badges
  const slmBadge = document.getElementById('slm-badge');
  const slmConfidence = document.getElementById('slm-confidence');
  const slmProgress = document.getElementById('slm-progress');

  const llmCard = document.getElementById('llm-card');
  const llmBadge = document.getElementById('llm-badge');
  const conclusionBox = document.getElementById('conclusion-box');
  const llmExplanation = document.getElementById('llm-explanation');
  
  const wikiSection = document.getElementById('wiki-section');
  const wikiList = document.getElementById('wiki-list');
  const newsSection = document.getElementById('news-section');
  const newsList = document.getElementById('news-list');

  let isServerOnline = false;

  // 1. Check Server Connection Health
  async function checkServerHealth() {
    try {
      const resp = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (resp.ok) {
        setOnline();
      } else {
        setOffline("Lỗi kết nối máy chủ");
      }
    } catch (err) {
      setOffline("Máy chủ Ngoại tuyến");
    }
  }

  function setOnline() {
    isServerOnline = true;
    statusIndicator.innerHTML = `
      <span class="status-dot online"></span>
      <span class="status-label">Trực tuyến</span>
    `;
    validateInput();
  }

  function setOffline(reason) {
    isServerOnline = false;
    statusIndicator.innerHTML = `
      <span class="status-dot offline"></span>
      <span class="status-label">${reason}</span>
    `;
    btnPredict.disabled = true;
    btnAnalyze.disabled = true;
  }

  // 2. Validate input and enable buttons
  function validateInput() {
    const text = newsInput.value.trim();
    const isValid = text.length >= 10;
    if (isServerOnline) {
      btnPredict.disabled = !isValid;
      btnAnalyze.disabled = !isValid;
    }
  }

  newsInput.addEventListener('input', validateInput);

  // 3. Run health check on startup
  checkServerHealth();
  // Poll health every 5 seconds
  setInterval(checkServerHealth, 5000);

  // 4. Quick Predict Handler
  btnPredict.addEventListener('click', async () => {
    const text = newsInput.value.trim();
    if (!text) return;

    showLoading("PhoBERT đang phân tích cấu trúc ngôn ngữ...");
    hideError();
    hideResults();

    try {
      const resp = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });

      if (!resp.ok) throw new Error("Máy chủ phản hồi lỗi khi dự đoán nhanh.");

      const data = await resp.json();
      renderPredictResult(data);
    } catch (err) {
      showSimpleError(err.message || "Lỗi xử lý dự đoán nhanh.");
    } finally {
      hideLoading();
    }
  });

  // 5. Deep Analyze Handler
  btnAnalyze.addEventListener('click', () => {
    const text = newsInput.value.trim();
    if (!text) return;
    runDeepAnalysis(text);
  });

  async function runDeepAnalysis(text) {
    // Reset UI states
    hideError();
    llmCard.classList.add('hidden');
    
    // Clear any previous stepper
    if (stepperInterval) {
      clearInterval(stepperInterval);
      stepperInterval = null;
    }

    // Set buttons disabled
    btnPredict.disabled = true;
    btnAnalyze.disabled = true;

    // 1. Call Quick Predict first to show early results
    try {
      const respPredict = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
      if (respPredict.ok) {
        const dataPredict = await respPredict.json();
        renderPredictResult(dataPredict);
      }
    } catch (errPredict) {
      console.error("Predict error during analysis:", errPredict);
    }

    // 2. Activate Stepper view
    simpleLoading.classList.add('hidden');
    stepperLoading.classList.remove('hidden');
    loadingSpinner.classList.remove('hidden');

    let loadingStep = 1;
    setLoadingStep(loadingStep);

    stepperInterval = setInterval(() => {
      if (loadingStep < 4) {
        loadingStep++;
        setLoadingStep(loadingStep);
      }
    }, 4000);

    // 3. Call Deep Analysis API
    try {
      const resp = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || "Máy chủ phản hồi lỗi khi chạy RAG + LLM.");
      }

      renderAnalyzeResult(data);
      hideLoading();
    } catch (err) {
      console.error("Deep analysis failed:", err);
      hideLoading();
      showDeepAnalyzeError(err.message || "Lỗi xử lý phân tích chéo.", text);
    } finally {
      if (stepperInterval) {
        clearInterval(stepperInterval);
        stepperInterval = null;
      }
    }
  }

  // 6. UI Render Functions
  function showLoading(msg) {
    if (msg) {
      loadingText.textContent = msg;
    }
    simpleLoading.classList.remove('hidden');
    stepperLoading.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
    btnPredict.disabled = true;
    btnAnalyze.disabled = true;
  }

  function hideLoading() {
    loadingSpinner.classList.add('hidden');
    validateInput();
  }

  function setLoadingStep(step) {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`step-${i}`);
      if (!el) continue;
      el.className = 'step-item';
      const icon = el.querySelector('.step-icon');
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
  }

  function showSimpleError(msg) {
    errorMessage.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="error-icon">⚠️</span>
        <span class="error-text">${escapeHtml(msg)}</span>
      </div>
    `;
    errorMessage.classList.remove('hidden');
  }

  function showDeepAnalyzeError(msg, textToRetry) {
    errorMessage.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <div class="error-header">
          <span class="error-icon">⚠️</span>
          <span class="error-title">Không thể hoàn thành phân tích chuyên sâu</span>
        </div>
        <div class="error-text">${escapeHtml(msg)}</div>
        <p class="error-desc">Lỗi này có thể xảy ra do sự cố tạm thời của mô hình ngôn ngữ lớn (LLM) hoặc chính sách giới hạn API. Bạn có thể nhấn nút dưới đây để thực hiện lại phân tích.</p>
        <button id="btn-retry-analyze" class="btn btn-retry">
          🔄 Thử lại phân tích
        </button>
      </div>
    `;
    errorMessage.classList.remove('hidden');

    const retryBtn = document.getElementById('btn-retry-analyze');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        runDeepAnalysis(textToRetry);
      });
    }
  }

  function hideError() {
    errorMessage.innerHTML = '';
    errorMessage.classList.add('hidden');
  }

  function hideResults() {
    resultsPanel.classList.add('hidden');
    llmCard.classList.add('hidden');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }


  function getQuickPredictionDisplay(slmLabel, slmConfidence) {
    const confidencePct = Math.round(slmConfidence * 100);
    const isFake = slmLabel === 1;

    if (!isFake) {
      if (confidencePct >= 90) return { label: 'Tin thật: Đáng tin cậy', badgeClass: 'real-high', progressClass: 'real-high' };
      if (confidencePct >= 75) return { label: 'Tin thật: Khá tin cậy', badgeClass: 'real-medium', progressClass: 'real-medium' };
      if (confidencePct >= 60) return { label: 'Tin thật: Có cơ sở', badgeClass: 'real-low', progressClass: 'real-low' };
      return { label: 'Tin thật: Cần xác minh', badgeClass: 'none', progressClass: 'none' };
    }

    if (confidencePct >= 90) return { label: 'Tin giả: Không đáng tin', badgeClass: 'fake-high', progressClass: 'fake-high' };
    if (confidencePct >= 75) return { label: 'Tin giả: Ít tin cậy', badgeClass: 'fake-medium', progressClass: 'fake-medium' };
    if (confidencePct >= 60) return { label: 'Tin giả: Có dấu hiệu sai lệch', badgeClass: 'fake-low', progressClass: 'fake-low' };
    return { label: 'Tin giả: Cần thận trọng', badgeClass: 'fake-warn', progressClass: 'fake-warn' };
  }

  function renderPredictResult(data) {
    const confidencePct = Math.round(data.slm_confidence * 100);
    const display = getQuickPredictionDisplay(data.slm_label, data.slm_confidence);

    slmBadge.textContent = display.label;
    slmBadge.className = `badge ${display.badgeClass}`;
    
    slmConfidence.textContent = `${confidencePct}%`;
    slmProgress.style.width = `${confidencePct}%`;
    slmProgress.className = `progress-bar ${display.progressClass}`;

    resultsPanel.classList.remove('hidden');
  }

  function renderAnalyzeResult(data) {
    // Render SLM prediction (RAG response includes both)
    renderPredictResult({
      slm_label: data.slm_label,
      slm_confidence: data.slm_confidence
    });

    const slmIsFake = data.slm_label === 1;
    const llmIsFake = data.llm_label === 1;

    // Render LLM Card
    llmBadge.textContent = llmIsFake ? "GIẢ" : "THẬT";
    llmBadge.className = `badge ${llmIsFake ? 'fake' : 'real'}`;

    // Render Consensus Block
    if (slmIsFake === llmIsFake) {
      conclusionBox.textContent = slmIsFake 
        ? "🚨 ĐỒNG NHẤT: Cả mô hình dự đoán nhanh và phân tích sự kiện đều kết luận đây là TIN GIẢ."
        : "✅ ĐỒNG NHẤT: Cả mô hình dự đoán nhanh và phân tích sự kiện đều nhận định là TIN THẬT.";
      conclusionBox.className = `conclusion-box ${slmIsFake ? 'match-fake' : 'match-real'}`;
    } else {
      const slmStr = slmIsFake ? "Giả" : "Thật";
      const llmStr = llmIsFake ? "Giả" : "Thật";
      conclusionBox.textContent = `⚠️ XUNG ĐỘT: Văn phong có đặc điểm tin ${slmStr}, nhưng đối chiếu thực tế của LLM nhận định tin ${llmStr}. Người dùng cần tự đối chiếu đánh giá.`;
      conclusionBox.className = `conclusion-box conflict`;
    }

    // Explanation
    llmExplanation.textContent = data.llm_explanation || "Không có giải thích chi tiết.";

    // Wikipedia Evidence
    wikiList.innerHTML = '';
    if (data.wiki_evidence && Object.keys(data.wiki_evidence).length > 0) {
      wikiSection.classList.remove('hidden');
      Object.entries(data.wiki_evidence).forEach(([ent, desc]) => {
        const item = document.createElement('div');
        item.className = 'evidence-item';
        item.innerHTML = `<strong>${ent}:</strong> <span class="evidence-item-desc">${desc}</span>`;
        wikiList.appendChild(item);
      });
    } else {
      wikiSection.classList.add('hidden');
    }

    // News/RAG Evidence
    newsList.innerHTML = '';
    if (data.rag_evidence && data.rag_evidence.length > 0) {
      newsSection.classList.remove('hidden');
      data.rag_evidence.forEach(article => {
        const item = document.createElement('div');
        item.className = 'evidence-item';
        
        let linkHtml = '';
        if (article.url && article.url.startsWith('http')) {
          linkHtml = `<a href="${article.url}" target="_blank" class="evidence-link">Xem nguồn đối chứng →</a>`;
        }

        item.innerHTML = `
          <div class="evidence-item-title">${article.title}</div>
          <div class="evidence-item-desc">"${article.chunk_text}"</div>
          ${linkHtml}
        `;
        newsList.appendChild(item);
      });
    } else {
      newsSection.classList.add('hidden');
    }

    llmCard.classList.remove('hidden');
  }
});
