// 확장 프로그램 라이프사이클 컨텍스트 바인딩 스크립트 (v2.1.0 - 스마트 로컬 캐싱 통합 버전)
(async function() {
    'use strict';

    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('styles.css');
    (document.head || document.documentElement).appendChild(style);

    let settings = { closeOnScroll: true, tagAdjustEnabled: true };
    chrome.storage.local.get(['closeOnScroll', 'tagAdjustEnabled'], (res) => {
        if(res.closeOnScroll !== undefined) settings.closeOnScroll = res.closeOnScroll;
        if(res.tagAdjustEnabled !== undefined) settings.tagAdjustEnabled = res.tagAdjustEnabled;
    });

    const tooltip = document.createElement('div');
    tooltip.id = 'steam-stat-tooltip';
    document.body.appendChild(tooltip);

    function showTooltip(e, htmlContent) {
        if(!htmlContent) return;
        tooltip.innerHTML = htmlContent;
        tooltip.style.display = 'block';
        moveTooltip(e);
    }
    function moveTooltip(e) {
        const tw = 264, th = tooltip.offsetHeight || 120;
        let x = e.clientX + 14, y = e.clientY - th / 2;
        if (x + tw > window.innerWidth) x = e.clientX - tw - 14;
        if (y < 8) y = 8;
        if (y + th > window.innerHeight) y = window.innerHeight - th - 8;
        tooltip.style.left = `${x}px`;
        tooltip.style.top  = `${y}px`;
    }
    function hideTooltip() { tooltip.style.display = 'none'; }

    const modal = document.createElement('div');
    modal.id = 'steam-rating-modal';
    modal.innerHTML = `
        <div class="steam-header">
            <span class="steam-title">Steam Novel Rating</span>
            <span class="steam-header-actions">
                <span class="steam-settings-btn" id="steam-modal-settings-btn" title="설정">⚙</span>
                <span class="steam-close" id="steam-modal-close">&times;</span>
            </span>
        </div>
        <div id="steam-modal-settings" class="steam-settings-panel" style="display:none">
            <div class="setting-row">
                <span>스크롤 시 창 자동 닫기</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="setting-close-on-scroll">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="setting-row">
                <span>태그 보정 (19금·TS 추천비 조정)</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="setting-tag-adjust">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        <div class="steam-novel-title" id="steam-modal-novel-title">소설 제목</div>
        <div class="steam-ep-badge" id="steam-modal-ep-count"></div>
        <div class="steam-rating-row">
            <span class="steam-label">종합 평가:</span>
            <span class="steam-rating-value" id="steam-modal-rating-val">분석 중...</span>
        </div>
        <div class="steam-sub-text" id="steam-modal-sub-text">지표 데이터 수집 중...</div>
        <div class="steam-divider"></div>
        <div class="steam-stats-section">
            <div class="steam-stat-row" id="steam-row-rec">
                <div class="stat-meta">
                    <span class="stat-label" id="steam-modal-rec-label">추천비 점수</span>
                    <span class="stat-value" id="steam-modal-rec-val">-</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar bar-rec" id="steam-modal-rec-bar" style="width:0%"></div>
                </div>
            </div>
            <div class="steam-stat-row" id="steam-row-ret">
                <div class="stat-meta">
                    <span class="stat-label">연독률 (중장편 구간 보정)</span>
                    <span class="stat-value" id="steam-modal-ret-val">-</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar bar-ret" id="steam-modal-ret-bar" style="width:0%"></div>
                </div>
            </div>
            <div class="steam-stat-row" id="steam-row-hl">
                <div class="stat-meta">
                    <span class="stat-label">독자 유지력 (실제 반감 화수)</span>
                    <span class="stat-value" id="steam-modal-hl-val">-</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar bar-hl" id="steam-modal-hl-bar" style="width:0%"></div>
                </div>
            </div>
            <div class="steam-stat-row" id="steam-row-comment">
                <div class="stat-meta">
                    <span class="stat-label">독자 상호작용 (베댓 추천)</span>
                    <span class="stat-value" id="steam-modal-comment-val">-</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar bar-comment" id="steam-modal-comment-bar" style="width:0%"></div>
                </div>
            </div>
            <div class="steam-stat-row" id="steam-row-cycle">
                <div class="stat-meta">
                    <span class="stat-label" id="steam-modal-cycle-label">연재 주기 및 일관성</span>
                    <span class="stat-value" id="steam-modal-cycle-val">-</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar bar-cycle" id="steam-modal-cycle-bar" style="width:0%"></div>
                </div>
            </div>
        </div>
        <div class="steam-tip">
            ⚠️ 이 평가는 전수 조사 데이터를 통한 매핑 결과로, 절대적인 기준이 아닙니다.<br>
            💡 더블 우클릭하면 브라우저 기본 우클릭 메뉴가 열립니다.
        </div>
    `;
    document.body.appendChild(modal);

    async function postForm(url, data) {
        const fd = new FormData();
        for (const k in data) {
            if (Array.isArray(data[k])) data[k].forEach(v => fd.append(`${k}[]`, v));
            else fd.append(k, data[k]);
        }
        const res = await fetch(url, { method: "POST", body: fd });
        return res.text();
    }

    function getCardTitle(el) {
        const card = el.closest('.rank-novel-box, .novelbox, .novel-box, tr, li, div[class*="novel"], td');
        if (!card) return "";
        const titleEl = card.querySelector('.nov-tit, .name_st, .title, .epnew-novel-title, .share-nov-tit, .item-txt h6, h3, h4, h5, h6');
        if (titleEl) return titleEl.textContent.trim();
        const boldEl = card.querySelector('b, strong');
        return boldEl ? boldEl.textContent.trim() : "";
    }

    async function resolveNovelId(el) {
        let curr = el;
        while (curr && curr !== document.body) {
            const onclick = curr.getAttribute('onclick');
            if (onclick) { const m = onclick.match(/\/novel\/(\d+)/); if (m) return m[1]; }
            const href = curr.getAttribute('href');
            if (href) { const m = href.match(/\/novel\/(\d+)/); if (m) return m[1]; }
            curr = curr.parentElement;
        }

        const title = getCardTitle(el);
        if (title) {
            const cleanTitle = title.replace(/\[독점\]|\[완결\]|\[단편\]|\d+회차|\d+화/g, '').trim();
            if (cleanTitle) {
                try {
                    const resRaw = await postForm("/proc/novel", { cmd: "novel_search", search_type: "all", search_val: cleanTitle, rows: 5, page: 1 });
                    const res = JSON.parse(resRaw);
                    if (res?.list?.length > 0) {
                        const cl = cleanTitle.replace(/\s/g, '').toLowerCase();
                        const found = res.list.find(n => {
                            const nn = n.novel_name.replace(/\s/g, '').toLowerCase();
                            return nn.includes(cl) || cl.includes(nn);
                        });
                        if (found) return found.novel_no.toString();
                    }
                } catch(e) {}
            }
        }
        const dm = window.location.pathname.match(/\/novel\/(\d+)/);
        return dm ? dm[1] : null;
    }

    function getPageStats(doc) {
        const stats = {};
        (doc || document).querySelectorAll('.category-title').forEach(el => {
            const val = el.nextElementSibling;
            if (val) stats[el.textContent.trim()] = val.textContent.trim().replace(/,/g, '');
        });
        return stats;
    }

    async function loadNovelData(novelId) {
        let stats = {}, novelTitle = "소설 제목", isComplete = false, isAdult = false, hasTS = false;

        function detectTags(docToCheck) {
            const titleEl = docToCheck.querySelector('.epnew-novel-title, .share-nov-tit, .novel-title, .name_st');
            const infoArea = titleEl ? (titleEl.closest('.epnew-novel-info, .novel-info, .cover-info, .novel-header, .share-header, .novel-top, .epnew-wrap, .novel_view_box') || titleEl.parentElement?.parentElement || titleEl.parentElement) : null;
            if (infoArea) {
                if (infoArea.querySelectorAll('.b_19, .b_adult, .icon_adult, .adult_mark, .mark_adult, .badge_adult, .novel_adult').length > 0) {
                    isAdult = true;
                } else {
                    infoArea.querySelectorAll('span, div, p').forEach(el => { const txt = el.textContent.trim(); if (txt === '19' || txt === '19금' || txt === '성인') isAdult = true; });
                }
                infoArea.querySelectorAll('.b_keyword, .keyword_name, .tag_name, .novel_keyword, .kw_item, .tag-item, .keyword, .tag, a').forEach(el => {
                    const cleanText = el.textContent.trim().replace(/^#/, '').toLowerCase();
                    if (cleanText === 'ts') hasTS = true;
                });
            }
        }

        if (window.location.pathname.includes(`/novel/${novelId}`)) {
            stats = getPageStats(document);
            isComplete = !!document.querySelector('.b_comp');
            const te = document.querySelector('.epnew-novel-title, .share-nov-tit, h2.novel-title, .name_st, h2');
            novelTitle = te ? te.textContent.trim() : document.title.split('-')[0].trim();
            detectTags(document);
        } else {
            const html = await postForm(`/novel/${novelId}`, {});
            const doc = new DOMParser().parseFromString(html, 'text/html');
            stats = getPageStats(doc);
            isComplete = !!doc.querySelector('.b_comp');
            const te = doc.querySelector('.epnew-novel-title, .share-nov-tit, h2.novel-title, .name_st, h2');
            novelTitle = te ? te.textContent.trim() : "소설 제목";
            detectTags(doc);
        }

        let commentRows = [];
        try {
            const originalSortCookie = document.cookie.match(/(?:^|; )COMMENT_SORT=([^;]*)/)?.[1] || '';
            document.cookie = "COMMENT_SORT=vote; path=/; domain=.novelpia.com; max-age=5;";
            const ch = await postForm(`/proc/novel_comment/${novelId}?page=1&sort=vote`, { sort: "vote" });
            commentRows = Array.from(new DOMParser().parseFromString(ch, 'text/html').querySelectorAll('._comment_flag'));
            if (originalSortCookie) {
                document.cookie = `COMMENT_SORT=${originalSortCookie}; path=/; domain=.novelpia.com;`;
            } else {
                document.cookie = "COMMENT_SORT=; path=/; domain=.novelpia.com; max-age=0;";
            }
        } catch(e) {
            console.error("[SteamNovel] 댓글 수집 실패:", e);
        }

        return { stats, commentRows, novelTitle, isComplete, isAdult, hasTS };
    }

    function isCoverImage(el) {
        if (el.tagName !== 'IMG') return false;
        const src = el.src || '';
        if (src.includes('/cover/') || src.includes('/imagebox/') || el.classList.contains('cover_img')) return true;
        return !!el.closest('.rank-novel-cover, .novel-cover, .cover-img, .ep-thumb, .cover_img, .novel-img');
    }

    // 모달창 렌더링 동기화를 위한 공통 드라이버 함수 분리
    function applyDataToModal(rd) {
        document.getElementById('steam-modal-rating-val').textContent = `${rd.rating} (${rd.score}%)`;
        document.getElementById('steam-modal-rating-val').className = `steam-rating-value ${rd.ratingClass}`;
        document.getElementById('steam-modal-sub-text').textContent = rd.subText;

        document.getElementById('steam-modal-rec-label').textContent = `추천비 점수${rd.tagLabel || ''}`;
        document.getElementById('steam-modal-rec-val').textContent   = `${rd.recRatioText} (${rd.recScore}점)`;
        document.getElementById('steam-modal-rec-bar').style.width   = `${rd.recScore}%`;

        document.getElementById('steam-modal-ret-val').textContent = `${rd.retentionRateText} (${rd.retScore}점)`;
        document.getElementById('steam-modal-ret-bar').style.width = `${rd.retScore}%`;

        document.getElementById('steam-modal-hl-val').textContent = `${rd.halfLifeText} (${rd.halfLifeScore}점)`;
        document.getElementById('steam-modal-hl-bar').style.width = `${rd.halfLifeScore}%`;

        document.getElementById('steam-modal-comment-val').textContent = `${rd.commentText} (${rd.commentScore}점)`;
        document.getElementById('steam-modal-comment-bar').style.width = `${rd.commentScore}%`;

        document.getElementById('steam-modal-cycle-val').textContent = `${rd.cycleText} (${rd.cycleScore}점)`;
        document.getElementById('steam-modal-cycle-bar').style.width = `${rd.cycleScore}%`;

        document.getElementById('steam-row-rec').dataset.tip     = rd.recTooltip;
        document.getElementById('steam-row-ret').dataset.tip     = rd.retTooltip;
        document.getElementById('steam-row-hl').dataset.tip      = rd.halfLifeTooltip;
        document.getElementById('steam-row-comment').dataset.tip = rd.commentTooltip;
        document.getElementById('steam-row-cycle').dataset.tip   = rd.cycleTooltip;
    }

    let lastRightClickTime = 0;
    document.addEventListener('contextmenu', async (e) => {
        if (!isCoverImage(e.target)) return;
        const now = Date.now(), clickedEl = e.target;

        if (now - lastRightClickTime < 500) {
            modal.style.display = 'none'; hideTooltip();
        } else {
            e.preventDefault();
            const mw = 390, mh = 450;
            let left = e.clientX + 10, top = e.clientY + 10;
            if (left + mw > window.innerWidth) left = e.clientX - mw - 10;
            if (top + mh > window.innerHeight) top = e.clientY - mh - 10;
            modal.style.left = `${left}px`; modal.style.top = `${top}px`; modal.style.display = 'block';

            document.getElementById('steam-modal-novel-title').textContent = getCardTitle(clickedEl) || "소설 데이터 전수조사 중...";
            document.getElementById('steam-modal-ep-count').textContent = '';
            document.getElementById('steam-modal-rating-val').textContent = "연결 진행 중...";
            document.getElementById('steam-modal-rating-val').className = "steam-rating-value";
            document.getElementById('steam-modal-sub-text').textContent = "로컬 캐시 및 소설 구조 검사 중...";
            document.getElementById('steam-modal-rec-label').textContent = '추천비 점수';

            ['rec', 'ret', 'hl', 'comment', 'cycle'].forEach(k => {
                document.getElementById(`steam-modal-${k}-val`).textContent = "-";
                document.getElementById(`steam-modal-${k}-bar`).style.width = "0%";
                document.getElementById(`steam-row-${k}`).dataset.tip = '';
            });

            try {
                const novelId = await resolveNovelId(clickedEl);
                if (!novelId) {
                    document.getElementById('steam-modal-rating-val').textContent = "식별 실패";
                    document.getElementById('steam-modal-sub-text').textContent = "소설 번호를 찾을 수 없습니다.";
                    lastRightClickTime = now; return;
                }

                // [1단계] 실시간 화수 및 전체 누적 조회수를 수집하기 위해 기본 소설 데이터 1차 로드
                const novelData = await loadNovelData(novelId);
                document.getElementById('steam-modal-novel-title').textContent = novelData.novelTitle;

                const currentEpCount = parseInt(novelData.stats['회차']) || 0;
                const currentTotalViews = parseInt(novelData.stats['조회']) || 0;
                const badges = (novelData.isAdult ? ' 🔞' : '') + (novelData.hasTS ? ' [TS]' : '');
                const epBadgeText = currentEpCount > 0 ? `총 ${currentEpCount}화${badges}` : badges.trim() || '';
                document.getElementById('steam-modal-ep-count').textContent = epBadgeText;

                // [2단계] 로컬 스토리지에 저장된 해당 소설의 기존 분석 스냅샷 확보
                chrome.storage.local.get([`novel_${novelId}`], async (result) => {
                    const cached = result[`novel_${novelId}`];
                    let useCache = false;

                    if (cached) {
                        const timeDiff = now - cached.timestamp;
                        const cacheLimit = 3 * 24 * 60 * 60 * 1000; // 기본 3일 제한 유효성 체크

                        // 화수가 일치하는지 먼저 엄격하게 비교
                        if (cached.epCount === currentEpCount && timeDiff < cacheLimit) {
                            // 누적 조회수의 절댓값 편차(오차율) 계산
                            const viewDiff = Math.abs(currentTotalViews - cached.totalViews);
                            const viewErrorRate = cached.totalViews > 0 ? (viewDiff / cached.totalViews) : 0;

                            // 조회수 편차가 10% 미만(0.1 미만)인 경우 캐시 재사용 승인
                            if (viewErrorRate < 0.1) {
                                useCache = true;
                            }
                        }
                    }

                    // [3단계-A] 스마트 캐시 조건 달성 시: 렌더링 후 유효 만료 기간을 다시 3일로 리프레시 연장
                    if (useCache && cached?.scoreData) {
                        applyDataToModal(cached.scoreData);

                        // 현재 시간 기준으로 타임스탬프만 업데이트하여 유효기간 재설정 (3일 연장 마법)
                        cached.timestamp = Date.now();
                        chrome.storage.local.set({ [`novel_${novelId}`]: cached });

                        console.log(`[SteamNovel] 소설 ${novelId} 캐시 적중! 조건 만족으로 만료 기한이 오늘부터 3일 연장되었습니다.`);
                        return;
                    }

                    // [3단계-B] 캐시가 없거나 실시간 조건(화수 변경 or 조회수 10% 이상 대격변) 충족 시: 정밀 전수조사 엔진 가동
                    document.getElementById('steam-modal-sub-text').textContent = "화수 혹은 조회수 변동 감지. 모든 화수의 조회수 데이터를 병렬 로드 중입니다...";

                    const rd = await Engine.calculate(
                        novelData.stats,
                        novelData.commentRows,
                        novelId,
                        novelData.isComplete,
                        novelData.isAdult,
                        novelData.hasTS,
                        settings
                    );

                    // 화면에 새로 계산된 결과 매핑
                    applyDataToModal(rd);

                    // 다음 조사를 위해 조건 검증 데이터와 함께 새 로컬 캐시 구조 저장
                    const dataToSave = {
                        timestamp: Date.now(),
                        epCount: currentEpCount,         // 다음 우클릭 시 비교용 화수
                        totalViews: currentTotalViews,   // 다음 우클릭 시 오차 계산용 누적 조회수
                        scoreData: rd                    // 가공 완료된 결과 오브젝트
                    };
                    chrome.storage.local.set({ [`novel_${novelId}`]: dataToSave });
                    console.log(`[SteamNovel] 소설 ${novelId} 정밀 분석 완료. 기준 정보가 캐시에 새로 세이브되었습니다.`);
                });

            } catch(err) {
                console.error("[SteamNovel] 처리 오류:", err);
                document.getElementById('steam-modal-rating-val').textContent = "오류 발생";
                document.getElementById('steam-modal-sub-text').textContent   = "데이터 통신 또는 분석 중 오류가 발생했습니다.";
            }
        }
        lastRightClickTime = now;
    });

    document.getElementById('steam-modal-close').addEventListener('click', () => { modal.style.display = 'none'; hideTooltip(); });

    ['rec', 'ret', 'hl', 'comment', 'cycle'].forEach(k => {
        const row = document.getElementById(`steam-row-${k}`);
        row.addEventListener('mouseenter', (e) => showTooltip(e, row.dataset.tip));
        row.addEventListener('mousemove', moveTooltip);
        row.addEventListener('mouseleave', hideTooltip);
    });
    document.getElementById('steam-modal-settings-btn').addEventListener('click', () => {
        const p = document.getElementById('steam-modal-settings');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('setting-close-on-scroll').addEventListener('change', (e) => { settings.closeOnScroll = e.target.checked; chrome.storage.local.set({closeOnScroll: settings.closeOnScroll}); });
    document.getElementById('setting-tag-adjust').addEventListener('change', (e) => { settings.tagAdjustEnabled = e.target.checked; chrome.storage.local.set({tagAdjustEnabled: settings.tagAdjustEnabled}); });
    window.addEventListener('scroll', () => { if (settings.closeOnScroll && modal.style.display === 'block') { modal.style.display = 'none'; hideTooltip(); } }, { passive: true });
})();