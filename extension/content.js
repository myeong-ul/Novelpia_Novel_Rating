// 확장 프로그램 라이프사이클 컨텍스트 바인딩 스크립트 (v2.0.0)
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
            document.getElementById('steam-modal-sub-text').textContent = "모든 화수의 조회수 데이터를 병렬 로드 중입니다...";
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

                const novelData = await loadNovelData(novelId);
                document.getElementById('steam-modal-novel-title').textContent = novelData.novelTitle;
                const epCount = parseInt(novelData.stats['회차']) || 0;
                const badges = (novelData.isAdult ? ' 🔞' : '') + (novelData.hasTS ? ' [TS]' : '');
                document.getElementById('steam-modal-ep-count').textContent = epCount > 0 ? `총 ${epCount}화${badges}` : badges.trim() || '';

                const rd = await Engine.calculate(
                    novelData.stats,
                    novelData.commentRows,
                    novelId,
                    novelData.isComplete,
                    novelData.isAdult,
                    novelData.hasTS,
                    settings
                );

                document.getElementById('steam-modal-rating-val').textContent = `${rd.rating} (${rd.score}%)`;
                document.getElementById('steam-modal-rating-val').className = `steam-rating-value ${rd.ratingClass}`;
                document.getElementById('steam-modal-sub-text').textContent = rd.subText;

                document.getElementById('steam-modal-rec-label').textContent = `추천비 점수${rd.tagLabel}`;
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