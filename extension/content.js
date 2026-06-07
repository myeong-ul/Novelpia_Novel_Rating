// 확장 프로그램 라이프사이클 컨텍스트 바인딩 스크립트 (v2.2.0 - PC/모바일 하이브리드 & 스마트 캐시 통합)
(async function() {
    'use strict';

    // 1. 스타일시트 동적 주입 (모바일 화면 대응 뷰포트 스케일링 보정 포함)
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('styles.css');
    (document.head || document.documentElement).appendChild(style);

    // 모바일 전용 반응형 레이아웃 덮어쓰기 스타일 (styles.css 보완)
    const mStyle = document.createElement('style');
    mStyle.textContent = `
        @media (max-width: 768px) {
            #steam-rating-modal {
                position: fixed !important;
                left: 50% !important;
                top: 50% !important;
                bottom: auto !important;
                right: auto !important;
                transform: translate(-50%, -50%) !important;
                width: 90% !important;
                max-width: 380px !important;
                box-sizing: border-box !important;
            }
            #steam-stat-tooltip {
                position: fixed !important;
                left: 50% !important;
                top: auto !important;
                bottom: 20px !important;
                transform: translateX(-50%) !important;
                width: 85% !important;
                max-width: 340px !important;
            }
        }
    `;
    (document.head || document.documentElement).appendChild(mStyle);

    let settings = { closeOnScroll: true, tagAdjustEnabled: true };
    chrome.storage.local.get(['closeOnScroll', 'tagAdjustEnabled'], (res) => {
        if(res.closeOnScroll !== undefined) settings.closeOnScroll = res.closeOnScroll;
        if(res.tagAdjustEnabled !== undefined) settings.tagAdjustEnabled = res.tagAdjustEnabled;
    });

    const tooltip = document.createElement('div');
    tooltip.id = 'steam-stat-tooltip';
    document.body.appendChild(tooltip);

    // 툴팁 출력 헬퍼 (PC/모바일 교차 지원)
    function showTooltip(e, htmlContent, isMobile = false) {
        if(!htmlContent) return;
        tooltip.innerHTML = htmlContent;
        tooltip.style.display = 'block';
        if (!isMobile && e) {
            moveTooltip(e);
        }
    }
    function moveTooltip(e) {
        if (window.innerWidth <= 768) return; // 모바일 화면에선 중앙 하단 고정이므로 연산 패스
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
            💡 모바일은 화면 빈 곳 터치 시 창이 닫힙니다.
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

    // =========================================================================
    // 2. 핵심 분석 트리거 및 스마트 캐시 검증 엔진 파트 (PC / Mobile 통합 공용)
    // =========================================================================
    async function executeAnalysisPipeline(clickedEl, clientX, clientY) {
        const isMobile = window.innerWidth <= 768;

        // 모달 위치 분기 연산
        if (isMobile) {
            modal.style.left = '50%'; modal.style.top = '50%';
        } else {
            const mw = 390, mh = 450;
            let left = clientX + 10, top = clientY + 10;
            if (left + mw > window.innerWidth) left = clientX - mw - 10;
            if (top + mh > window.innerHeight) top = clientY - mh - 10;
            modal.style.left = `${left}px`; modal.style.top = `${top}px`;
        }
        modal.style.display = 'block';

        // 뼈대 UI 초기화
        document.getElementById('steam-modal-novel-title').textContent = getCardTitle(clickedEl) || "소설 데이터 전수조사 중...";
        document.getElementById('steam-modal-ep-count').textContent = '';
        document.getElementById('steam-modal-rating-val').textContent = "연결 진행 중...";
        document.getElementById('steam-modal-rating-val').className = "steam-rating-value";
        document.getElementById('steam-modal-sub-text').textContent = "로컬 캐시 조건 검사 중...";
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
                return;
            }

            // [1차 데이터] 오차 검증을 위한 껍데기 통계 실시간 스크랩 (초고속 부하X)
            const novelData = await loadNovelData(novelId);
            document.getElementById('steam-modal-novel-title').textContent = novelData.novelTitle;

            const currentEpCount = parseInt(novelData.stats['회차']) || 0;
            const currentTotalViews = parseInt(novelData.stats['조회']) || 0;
            const badges = (novelData.isAdult ? ' 🔞' : '') + (novelData.hasTS ? ' [TS]' : '');
            const epBadgeText = currentEpCount > 0 ? `총 ${currentEpCount}화${badges}` : badges.trim() || '';
            document.getElementById('steam-modal-ep-count').textContent = epBadgeText;

            // [스마트 캐시] 로컬 스토리지에 백업된 데이터 매핑
            chrome.storage.local.get([`novel_${novelId}`], async (result) => {
                const cached = result[`novel_${novelId}`];
                let useCache = false;

                if (cached) {
                    const timeDiff = Date.now() - cached.timestamp;
                    const cacheLimit = 3 * 24 * 60 * 60 * 1000; // 3일 유효 기한 기본 체크

                    // 조건 1: 최신 연재 화수가 완벽히 일치하는지 확인
                    if (cached.epCount === currentEpCount && timeDiff < cacheLimit) {
                        // 조건 2: 조회수 오차 변동률이 10% 미만인지 연산
                        const viewDiff = Math.abs(currentTotalViews - cached.totalViews);
                        const viewErrorRate = cached.totalViews > 0 ? (viewDiff / cached.totalViews) : 0;

                        if (viewErrorRate < 0.1) {
                            useCache = true;
                        }
                    }
                }

                // 분기 A: 스마트 캐시 조건 통과 -> 데이터 즉시 사출 후 수명 3일 재연장
                if (useCache && cached?.scoreData) {
                    applyDataToModal(cached.scoreData);

                    cached.timestamp = Date.now(); // 만료 기한 3일 롤백 연장
                    chrome.storage.local.set({ [`novel_${novelId}`]: cached });

                    console.log(`[SteamNovel] 캐시 히트 성공! 소설 ${novelId}의 유효 기간이 오늘부터 3일 재연장되었습니다.`);
                    return;
                }

                // 분기 B: 캐시가 없거나 데이터 규격 탈락 -> 정밀 전수조사 파이프라인 가동
                document.getElementById('steam-modal-sub-text').textContent = "화수/조회수 대격변 감지. 전수조사를 진행합니다...";

                const rd = await Engine.calculate(
                    novelData.stats,
                    novelData.commentRows,
                    novelId,
                    novelData.isComplete,
                    novelData.isAdult,
                    novelData.hasTS,
                    settings
                );

                applyDataToModal(rd);

                // 다음 조사를 위해 고유 식별 메타데이터와 함께 캐싱 디스크에 보관
                const dataToSave = {
                    timestamp: Date.now(),
                    epCount: currentEpCount,
                    totalViews: currentTotalViews,
                    scoreData: rd
                };
                chrome.storage.local.set({ [`novel_${novelId}`]: dataToSave });
                console.log(`[SteamNovel] 소설 ${novelId} 정밀 분석 성공. 로컬 저장소 스냅샷이 갱신되었습니다.`);
            });

        } catch(err) {
            console.error("[SteamNovel] 파이프라인 장애 발령:", err);
            document.getElementById('steam-modal-rating-val').textContent = "오류 발생";
            document.getElementById('steam-modal-sub-text').textContent   = "데이터 통신 또는 분석 중 오류가 발생했습니다.";
        }
    }

    // =========================================================================
    // 3. 이벤트 드라이버 바인딩 (PC - 우클릭 / 모바일 - 롱터치 제어)
    // =========================================================================

    // [PC 전용 인터페이스]
    let lastRightClickTime = 0;
    document.addEventListener('contextmenu', async (e) => {
        if (window.innerWidth <= 768 || !isCoverImage(e.target)) return;
        const now = Date.now();

        if (now - lastRightClickTime < 500) {
            modal.style.display = 'none'; hideTooltip();
        } else {
            e.preventDefault();
            await executeAnalysisPipeline(e.target, e.clientX, e.clientY);
        }
        lastRightClickTime = now;
    });

    // [모바일 전용 인터페이스] 롱터치(600ms) 바인딩 및 컨텍스트 메뉴 무력화
    let touchTimer = null;
    let longTouched = false;
    let touchStartEl = null;

    document.addEventListener('touchstart', (e) => {
        if (!isCoverImage(e.target)) return;

        // 기존 실행 중인 타이머 초기화 (더블 터치 방크 차단)
        if (touchTimer) clearTimeout(touchTimer);

        longTouched = false;
        touchStartEl = e.target;

        touchTimer = setTimeout(() => {
            longTouched = true;
            const touch = e.touches[0];
            // 진동 피드백 (모바일 전용 내장 햅틱 브릿지 - 지원 브라우저만 작동)
            if (navigator.vibrate) navigator.vibrate(40);

            executeAnalysisPipeline(touchStartEl, touch.clientX, touch.clientY);
        }, 600); // 0.6초 동안 누르고 있으면 실행
    }, { passive: true });

    document.addEventListener('touchmove', () => {
        // 유저가 터치 후 화면을 스크롤(드래그)하면 롱터치 인식을 즉시 취소
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        if (longTouched) {
            // 롱터치가 성사되어 모달이 뜬 경우 브라우저 기본 컨텍스트 메뉴나 하이라이트 방지
            e.preventDefault();
        }
    });

    // 툴팁 터치/마우스 호버 가변 이벤트 제어 리스너
    ['rec', 'ret', 'hl', 'comment', 'cycle'].forEach(k => {
        const row = document.getElementById(`steam-row-${k}`);

        // PC 이벤트
        row.addEventListener('mouseenter', (e) => {
            if (window.innerWidth > 768) showTooltip(e, row.dataset.tip, false);
        });
        row.addEventListener('mousemove', moveTooltip);
        row.addEventListener('mouseleave', hideTooltip);

        // 모바일 이벤트 (터치 시 중앙 하단에 고정 툴팁 토글)
        row.addEventListener('touchstart', (e) => {
            if (window.innerWidth <= 768) {
                e.stopPropagation();
                const tipContent = row.dataset.tip;
                if(tipContent) showTooltip(null, tipContent, true);
            }
        }, { passive: true });
    });

    // 전역 창 닫기 핸들러 (PC 스크롤 및 모바일 외부 바깥 빈 화면 터치 대응)
    document.getElementById('steam-modal-close').addEventListener('click', () => { modal.style.display = 'none'; hideTooltip(); });

    document.getElementById('steam-modal-settings-btn').addEventListener('click', () => {
        const p = document.getElementById('steam-modal-settings');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('setting-close-on-scroll').addEventListener('change', (e) => { settings.closeOnScroll = e.target.checked; chrome.storage.local.set({closeOnScroll: settings.closeOnScroll}); });
    document.getElementById('setting-tag-adjust').addEventListener('change', (e) => { settings.tagAdjustEnabled = e.target.checked; chrome.storage.local.set({tagAdjustEnabled: settings.tagAdjustEnabled}); });

    window.addEventListener('scroll', () => {
        if (settings.closeOnScroll && modal.style.display === 'block' && window.innerWidth > 768) {
            modal.style.display = 'none'; hideTooltip();
        }
    }, { passive: true });

    // 모바일 외부 영역 터치 및 바깥 클릭 시 모달/툴팁 증발 레이어
    const dismissContainer = (e) => {
        if (modal.style.display === 'block' && !modal.contains(e.target)) {
            modal.style.display = 'none';
            hideTooltip();
        } else if (tooltip.style.display === 'block' && !tooltip.contains(e.target)) {
            hideTooltip();
        }
    };
    document.addEventListener('click', dismissContainer);
    document.addEventListener('touchstart', dismissContainer, { passive: true });

})();