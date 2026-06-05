// ==UserScript==
// @name         노벨피아 스팀 스타일 연독/계산기 for Mobile(Steam Novel Rating)
// @namespace    https://novelpia.com/
// @version      2.0.0
// @description  노벨피아 소설 표지를 우클릭하면 스팀 스타일의 다차원 평점 및 연독률 지표 모달을 제공합니다.
// @author       AI Assistant
// @match        http://*.novelpia.com/*
// @match        https://*.novelpia.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(async function() {
    'use strict';

    // =========================================================================
    // 1. CSS 스타일 정의 (styles.css 통합)
    // =========================================================================
    const cssStyle = `
        #steam-rating-modal {
            position: fixed;
            z-index: 10000;
            width: 90%;             /* 모바일 화면 좌우 여백 확보 */
            max-width: 390px;       /* 최대 크기는 기존 유지 */
            background: linear-gradient(135deg, #1b2838 0%, #171a21 100%);
            border: 1px solid #66c0f4;
            border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            font-family: 'Motiva Sans', 'NanumSquare', sans-serif;
            color: #c7d5e0;
            padding: 18px;
            display: none;
            user-select: none;
            box-sizing: border-box;
            animation: steamFadeIn 0.18s ease-out;
        }
        @keyframes steamFadeIn {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        .steam-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #233c51; padding-bottom: 10px; margin-bottom: 10px; }
        .steam-title { font-size: 12px; font-weight: bold; letter-spacing: 0.8px; color: #66c0f4; text-transform: uppercase; }
        .steam-header-actions { display: flex; align-items: center; gap: 8px; }
        .steam-settings-btn { cursor: pointer; color: #556772; font-size: 14px; transition: color 0.15s; }
        .steam-settings-btn:hover { color: #66c0f4; }
        .steam-close { cursor: pointer; color: #66c0f4; font-size: 18px; transition: color 0.1s; }
        .steam-close:hover { color: #fff; }

        .steam-settings-panel { background: #111d2a; border: 1px solid #2a475e; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; }
        .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 11px; color: #8f98a0; }
        .setting-row + .setting-row { border-top: 1px solid #1a2d3f; }
        .toggle-switch { position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; inset: 0; background-color: #2a475e; border-radius: 18px; transition: .2s; }
        .toggle-slider:before { content: ""; position: absolute; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: #556772; border-radius: 50%; transition: .2s; }
        .toggle-switch input:checked + .toggle-slider { background-color: #1b87d8; }
        .toggle-switch input:checked + .toggle-slider:before { transform: translateX(16px); background-color: #fff; }

        .steam-novel-title { font-size: 15px; font-weight: bold; color: #fff; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .steam-ep-badge { font-size: 11px; color: #556772; margin-bottom: 8px; min-height: 14px; }
        .steam-rating-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .steam-label { font-size: 12px; color: #8f98a0; }
        .steam-rating-value { font-size: 15px; font-weight: bold; }
        .steam-color-positive { color: #66c0f4; text-shadow: 0 0 6px rgba(102,192,244,0.35); }
        .steam-color-mixed { color: #b8986c; text-shadow: 0 0 6px rgba(184,152,108,0.35); }
        .steam-color-negative { color: #c0544d; text-shadow: 0 0 6px rgba(192,84,77,0.35); }
        .steam-sub-text { font-size: 11px; color: #8f98a0; margin-bottom: 14px; line-height: 1.4; }
        .steam-divider { height: 1px; background-color: #233c51; margin: 10px 0; }

        .steam-stats-section { display: flex; flex-direction: column; gap: 9px; }
        .steam-stat-row { display: flex; flex-direction: column; gap: 3px; cursor: default; border-radius: 3px; padding: 2px 0; transition: background 0.1s; }
        .steam-stat-row:hover { background: rgba(102,192,244,0.04); }
        .stat-meta { display: flex; justify-content: space-between; font-size: 11px; }
        .stat-label { color: #8f98a0; }
        .stat-value { color: #fff; font-weight: bold; }
        .stat-bar-container { height: 6px; background-color: #101822; border-radius: 3px; overflow: hidden; }
        .stat-bar { height: 100%; border-radius: 3px; transition: width 0.55s ease-out; }
        .bar-rec     { background: linear-gradient(90deg, #3d85c6, #66c0f4); }
        .bar-ret     { background: linear-gradient(90deg, #7a3fa6, #c47e00); }
        .bar-comment { background: linear-gradient(90deg, #1e8a4a, #2ecc71); }
        .bar-cycle   { background: linear-gradient(90deg, #c04a00, #f39c12); }
        .bar-hl { background: linear-gradient(90deg, #116773, #179cb0); }

        #steam-stat-tooltip {
            position: fixed; 
            z-index: 10001; 
            background: #0c1820; 
            border: 1px solid #2a475e; 
            border-radius: 4px;
            padding: 10px 13px; 
            font-size: 11px; 
            color: #c7d5e0;
            line-height: 1.7; 
            width: 85%;             /* 모바일 대응 */
            max-width: 260px; 
            pointer-events: none; 
            display: none; 
            white-space: pre-line; 
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }
        #steam-stat-tooltip .tip-header { font-weight: bold; color: #66c0f4; font-size: 11px; border-bottom: 1px solid #1e3245; padding-bottom: 4px; margin-bottom: 5px; }
        #steam-stat-tooltip .tip-sep { color: #2a475e; }
        .steam-tip { font-size: 10px; color: #3d5566; margin-top: 14px; line-height: 1.5; border-top: 1px dashed #1e3245; padding-top: 10px; }
    `;
    const styleNode = document.createElement('style');
    styleNode.textContent = cssStyle;
    document.head.appendChild(styleNode);


    // =========================================================================
    // 2. 스팀 스타일 핵심 연독/계산 엔진 (engine.js 통합)
    // =========================================================================
    const Engine = {
        fmt(n) { return Number(n).toLocaleString('ko-KR'); },

        parseDate(s) {
            if (!s) return null;
            const cleanStr = s.replace(/\s+/g, '');

            if (cleanStr.includes('전') || cleanStr.includes('방금') || cleanStr.includes('오늘')) {
                return new Date();
            }

            const m = cleanStr.match(/(\d{2,4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/);
            if (!m) return null;

            let year = parseInt(m[1]);
            if (m[1].length === 2) year = 2000 + year;
            const month = parseInt(m[2]) - 1;
            const day = parseInt(m[3]);

            return new Date(year, month, day);
        },

        getDaysBetween(d1, d2) {
            if (!d1 || !d2) return 0;
            const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
            const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
            return Math.round(Math.abs(a - b) / 86400000);
        },

        async postForm(url, data) {
            const fd = new FormData();
            for (const k in data) {
                if (Array.isArray(data[k])) {
                    data[k].forEach(v => fd.append(`${k}[]`, v));
                } else {
                    fd.append(k, data[k]);
                }
            }
            const res = await fetch(url, { method: "POST", body: fd });
            return res.text();
        },

        async calculate(stats, commentRows, novelId, isComplete, isAdult = false, hasTS = false, settings = { tagAdjustEnabled: true }) {
            const views    = parseInt(stats['조회']) || 0;
            const recs     = parseInt(stats['추천']) || 0;
            const episodes = parseInt(stats['회차']) || 0;
            const _isComplete = (isComplete === true || isComplete === "true" || isComplete === "Y" || String(isComplete).toUpperCase() === 'Y');

            if (views < 1000) {
                return {
                    rating: "평가 부족", ratingClass: "steam-color-mixed", score: 0,
                    recScore: 0, retScore: 0, commentScore: 0, cycleScore: 0, halfLifeScore: 0, tagLabel: "",
                    recRatioText: "0.0%", retentionRateText: "평가 부족 (조회수 1천 미만)",
                    commentText: "-", cycleText: "-", halfLifeText: "-",
                    subText: "조회수가 1,000 이상인 작품만 평가 시스템이 동작합니다.",
                    recTooltip: "", retTooltip: "", commentTooltip: "", cycleTooltip: "", halfLifeTooltip: ""
                };
            }

            // ── 1. 추천비 점수 계산 ──
            const recRatio = recs / views;
            let tagMultiplier = 1.0;
            if (settings.tagAdjustEnabled) {
                if (isAdult) tagMultiplier *= 1.5;
                if (hasTS)   tagMultiplier *= 0.74;
            }
            const recScore = Math.min(100, Math.max(0, Math.round(recRatio * 1333 * tagMultiplier)));
            const tagLabel = settings.tagAdjustEnabled ? (isAdult && hasTS ? ' [19금+TS]' : isAdult ? ' [19금]' : hasTS ? ' [TS]' : '') : '';
            const baseThreshPct = (100 / (1333 * tagMultiplier) * 100).toFixed(1);

            const recTooltip = `<div class="tip-header">📊 추천비 점수</div>` +
                `기준: ~${baseThreshPct}% = 100점${tagLabel ? '\n태그 보정: ' + tagLabel : ''}\n` +
                `<span class="tip-sep">─────────────────────</span>\n` +
                `실제 추천비: ${(recRatio * 100).toFixed(2)}%\n` +
                `(추천 ${this.fmt(recs)} / 조회 ${this.fmt(views)})\n` +
                `계산 점수: ${recScore}점`;

            // ── 2. 전수조사 기반 데이터 수집 및 분석 ──
            let retScore = 70, retentionRateText = "계산 불가", retTooltip = '';
            let cycleScore = 100, cycleText = "분석 불가", cycleTooltip = '';
            let halfLifeScore = 50, halfLifeText = "데이터 부족", halfLifeTooltip = '';

            if (episodes > 1 && novelId) {
                try {
                    const totalPagesCount = Math.ceil(episodes / 20);
                    const allPageIndices = Array.from({ length: totalPagesCount }, (_, i) => i);

                    const pagesHtmlArray = await Promise.all(
                        allPageIndices.map(pg => this.postForm("/proc/episode_list", { "novel_no": novelId, "sort": "0", "page": pg.toString() }))
                    );

                    const rawEpisodesMap = {};
                    const latestEpDates = [];
                    let rawDateTexts = [];
                    const lastPageIndex = totalPagesCount - 1;

                    pagesHtmlArray.forEach((htmlPg, pgIndex) => {
                        const divPg = document.createElement('div');
                        divPg.innerHTML = htmlPg;

                        divPg.querySelectorAll('tr[data-episode-no], .ep_style5').forEach((row) => {
                            const epCode = row.getAttribute('data-episode-no') || row.querySelector('.episode_count_view')?.getAttribute('class')?.match(/\d+/)?.[0];
                            if (!epCode) return;

                            const textData = row.textContent || "";
                            const epMatch = textData.match(/EP\.(\d+)/i) || textData.match(/(\d+)\s*화/);
                            if (!epMatch) return;

                            const realEpIndex = parseInt(epMatch[1]);
                            rawEpisodesMap[realEpIndex] = epCode.trim();

                            if (pgIndex === lastPageIndex) {
                                const dateEl = row.querySelector('.ep_style2 b:not([class*="plus"]), td.ep_style2, .date, .ep_date, td[width="12%"], td:nth-child(4)');
                                if (dateEl) {
                                    let txt = dateEl.textContent.trim();
                                    if (txt.includes('PLUS') || txt.includes('궤도')) {
                                        const siblingTd = row.querySelectorAll('td');
                                        siblingTd.forEach(td => {
                                            const t = td.textContent.trim();
                                            if (/(\d{2})[\.\-\/](\d{2})/.test(t) || t.includes('전') || t.includes('오늘')) {
                                                txt = t;
                                            }
                                        });
                                    }
                                    if(txt) rawDateTexts.push(txt.replace(/\s+/g, ' '));
                                    const d = this.parseDate(txt);
                                    if (d) latestEpDates.push(d);
                                }
                            }
                        });
                    });

                    const allCollectedIndices = Object.keys(rawEpisodesMap).map(Number).sort((a,b) => a - b);
                    const codeListToFetch = allCollectedIndices.map(i => rawEpisodesMap[i]).filter(Boolean);
                    const allViewsMap = {};

                    if (codeListToFetch.length > 0) {
                        const chunkSize = 100;
                        const mergedList = [];

                        for (let i = 0; i < codeListToFetch.length; i += chunkSize) {
                            const chunk = codeListToFetch.slice(i, i + chunkSize);
                            try {
                                const vrRaw = await this.postForm("/proc/novel", {
                                    "cmd": "get_episode_count_view",
                                    "episode_arr": chunk,
                                    "novel_no": novelId
                                });

                                if (vrRaw.trim().startsWith("<")) {
                                    console.warn(`[SteamNovel] ${i}번째 청크에서 서버 에러가 응답되어 스킵되었습니다.`);
                                    continue;
                                }

                                const vrData = JSON.parse(vrRaw);
                                if (vrData?.list?.length > 0) {
                                    mergedList.push(...vrData.list);
                                }
                            } catch (chunkErr) {
                                console.error("[SteamNovel] 분할 조회수 로드 실패:", chunkErr);
                            }
                        }

                        if (mergedList.length > 0) {
                            const codeToEpIndex = {};
                            Object.entries(rawEpisodesMap).forEach(([epIdx, code]) => {
                                codeToEpIndex[code] = parseInt(epIdx);
                            });

                            mergedList.forEach(v => {
                                const epIdx = codeToEpIndex[v.episode_no];
                                if (epIdx) {
                                    allViewsMap[epIdx] = parseInt(v.count_view.replace(/,/g, '')) || 0;
                                }
                            });
                        }
                    }

                    const v1 = allViewsMap[1] || 0;
                    const v4 = allViewsMap[4] || 0;
                    const rawRange = Math.round(episodes * 0.2);
                    const windowSize = Math.max(20, Math.min(40, rawRange));

                    const epEnd = Math.max(1, episodes - 2);
                    const epEndPrev = Math.max(1, epEnd - windowSize);
                    const epMid = Math.floor(episodes / 2);
                    const epMidPrev = Math.max(1, epMid - windowSize);

                    const vMidPrev = allViewsMap[epMidPrev] || 0;
                    const vMid = allViewsMap[epMid] || 0;
                    const vEndPrev = allViewsMap[epEndPrev] || 0;
                    const vEnd = allViewsMap[epEnd] || 0;

                    if (episodes >= (windowSize + 5) && vMidPrev > 0 && vEndPrev > 0 && v4 > 0) {
                        const midRetention = vMid / vMidPrev;
                        const endRetention = vEnd / vEndPrev;
                        const totalRetention = vEnd / v4;

                        const scoreMid = Math.min(100, Math.round(midRetention * 100));
                        const scoreEnd = Math.min(100, Math.round(endRetention * 100));
                        const scoreTotal = episodes >= 80 ? Math.min(100, Math.round(totalRetention * 100 * 2.2)) : Math.min(100, Math.round(totalRetention * 100 * 1.2));

                        retScore = Math.max(0, Math.min(100, Math.round((scoreMid * 0.3) + (scoreEnd * 0.5) + (scoreTotal * 0.2))));
                        retentionRateText = `최근 유지력: ${(endRetention * 100).toFixed(1)}% (${windowSize}화 기준)`;
                        retTooltip = `<div class="tip-header">📈 중/장편 구간 연독률 (${windowSize}화 변동 구간)</div>` +
                            `• 허리구간 연독 (${epMidPrev}화➔${epMid}화): ${(midRetention * 100).toFixed(1)}%\n` +
                            `• 후반구간 연독 (${epEndPrev}화➔${epEnd}화): ${(endRetention * 100).toFixed(1)}%\n` +
                            `• 초반 대비 생존 (4화➔최신): ${(totalRetention * 100).toFixed(1)}%\n` +
                            `<span class="tip-sep">─────────────────────</span>\n` +
                            `최종 연독 점수: ${retScore}점`;
                    } else if (v4 > 0 && vEnd > 0) {
                        const simpleRatio = vEnd / v4;
                        retScore = Math.min(100, Math.max(0, Math.round(simpleRatio * 100)));
                        retentionRateText = `${(simpleRatio * 100).toFixed(1)}%`;
                        retTooltip = `<div class="tip-header">📈 연독률 (단거리 소설)</div>4화 대비 연독: ${retentionRateText}`;
                    } else {
                        retentionRateText = "데이터 부족";
                        retTooltip = `<div class="tip-header">📈 연독률 분석 실패</div>`;
                    }

                    if (v1 > 0 && v4 > 0) {
                        let hl1 = "유지됨", hl1Ep = episodes;
                        let hl4 = "유지됨", hl4Ep = episodes;

                        for (let i = 1; i <= episodes; i++) {
                            const currentView = allViewsMap[i];
                            if (currentView && currentView <= v1 * 0.5) {
                                hl1 = `${i}화`;
                                hl1Ep = i;
                                break;
                            }
                        }

                        for (let i = 4; i <= episodes; i++) {
                            const currentView = allViewsMap[i];
                            if (currentView && currentView <= v4 * 0.5) {
                                const diff = i - 4;
                                hl4 = `+${diff}화 뒤 (${i}화)`;
                                hl4Ep = diff;
                                break;
                            }
                        }

                        const getHl1Score = (ep) => {
                            if (ep === "유지됨" || ep > 30) {
                                if (ep === "유지됨") return 100;
                                const extra = Math.min(19, Math.round(((ep - 30) / Math.max(1, episodes - 30)) * 19));
                                return 81 + extra;
                            }
                            if (ep <= 4) return Math.round(10 + (ep / 4) * 20);
                            if (ep <= 15) {
                                const pct = (ep - 4) / (15 - 4);
                                return Math.round(31 + pct * 29);
                            }
                            const pct = (ep - 15) / (30 - 15);
                            return Math.round(61 + pct * 19);
                        };

                        const getHl4Score = (diff) => {
                            if (diff === "유지됨" || diff > 26) return 100;
                            if (diff <= 1) return 15;
                            if (diff <= 11) {
                                const pct = (diff - 1) / (11 - 1);
                                return Math.round(35 + pct * 25);
                            }
                            const pct = (diff - 11) / (26 - 11);
                            return Math.round(61 + pct * 20);
                        };

                        const sHl1 = hl1 === "유지됨" ? 100 : getHl1Score(hl1Ep);
                        const sHl4 = hl4 === "유지됨" ? 100 : getHl4Score(hl4Ep);

                        halfLifeScore = Math.round(sHl1 * 0.4 + sHl4 * 0.6);
                        halfLifeText = `1화기준: ${hl1} / 4화기준: ${hl4}`;

                        halfLifeTooltip = `<div class="tip-header">📉 독자 유지력 (절대 기준 반감기 평가)</div>` +
                            `• 1화 조회수 절반 (${this.fmt(Math.round(v1 * 0.5))}회) 이하 지점:\n  ➔ <span style="color:#ff6b6b;font-weight:bold">${hl1}</span> (구간 점수: ${sHl1}점)\n` +
                            `• 4화 조회수 절반 (${this.fmt(Math.round(v4 * 0.5))}회) 이하 지점:\n  ➔ <span style="color:#ff6b6b;font-weight:bold">${hl4}</span> (구간 점수: ${sHl4}점)\n` +
                            `<span class="tip-sep">─────────────────────</span>\n` +
                            `💡 <b>밸런스 패치 판정 지표:</b>\n` +
                            `  - 4화 이하 반감: 망작 (10~30점)\n` +
                            `  - 15화 이하 반감: 소재 반짝 (31~60점)\n` +
                            `  - 30화 이하 반감: 무난한 평작 (61~80점)\n` +
                            `  - 30화 초과 유지: 웰메이드 (81~100점)\n` +
                            `<span class="tip-sep">─────────────────────</span>\n` +
                            `• 최종 유지력 점수: ${halfLifeScore}점`;
                    }

                    if (_isComplete) {
                        cycleText = "완결 소설";
                        cycleScore = 100;
                        cycleTooltip = `<div class="tip-header">⏱ 연재 주기</div>완결 작품입니다.`;
                    } else if (latestEpDates.length > 1) {
                        latestEpDates.sort((a, b) => a - b);
                        const intervals = [];
                        for (let i = 1; i < latestEpDates.length; i++) {
                            const diff = this.getDaysBetween(latestEpDates[i], latestEpDates[i - 1]);
                            if (diff >= 0 && diff <= 60) intervals.push(diff);
                        }
                        if (intervals.length > 0) {
                            const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                            const dev = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length);
                            const daysSinceLast = this.getDaysBetween(new Date(), latestEpDates[latestEpDates.length - 1]);

                            const scoreSpeed = mean > 1.5 ? Math.max(0, 100 - Math.round((mean - 1.5) * 15)) : 100;
                            const scoreCons = dev > 0.5 ? Math.max(0, 100 - Math.round((dev - 0.5) * 35)) : 100;
                            let penalty = daysSinceLast > 30 ? 50 : (daysSinceLast > 10 ? 20 : 0);

                            cycleScore = Math.max(0, Math.min(100, Math.round(scoreSpeed * 0.6 + scoreCons * 0.4 - penalty)));
                            cycleText = `평균 ${mean.toFixed(1)}일 (${dev > 1.2 ? '불규칙' : '규칙적'}${penalty ? ' 지연' : ''})`;
                            cycleTooltip = `<div class="tip-header">⏱ 연재 주기</div>평균 간격: ${mean.toFixed(2)}일\n최근 공백: ${daysSinceLast}일`;
                        } else {
                            cycleText = "비정기 연재";
                            cycleScore = 50;
                        }
                    } else {
                        cycleText = "주기 파싱 제한";
                        cycleScore = 80;
                        const sampledTexts = rawDateTexts.slice(0, 3).join(' / ') || '없음';
                        cycleTooltip = `<div class="tip-header">⏱ 연재 주기 파싱 오류</div>` +
                            `수집된 텍스트 필터 실패: [${sampledTexts}]\n` +
                            `정규식 규격 필터 매칭에 실패하여 연재 주기를 계산할 수 없습니다.`;
                    }

                } catch(e) {
                    console.error(e);
                    cycleText = "분석 예외";
                    cycleScore = 50;
                }
            } else {
                cycleText = "단편 소설";
                cycleScore = 100;
            }

            let commentScore = 50, sumLikes = 0, commentText = "댓글 없음", commentTooltip = '';
            if (commentRows?.length > 0) {
                const likes = [];
                const processedId = new Set();

                commentRows.forEach(el => {
                    if (el.classList.contains('comment_re')) return;
                    const cId = el.getAttribute('id') || el.dataset.id;
                    if (cId && processedId.has(cId)) return;
                    if (cId) processedId.add(cId);

                    const m = el.querySelector('[id^="comment_vote_"]')?.textContent.match(/추천\s*\((\d+)\s*건\)/);
                    if (m) likes.push(parseInt(m[1]));
                });

                if (likes.length > 0) {
                    likes.sort((a, b) => b - a);
                    sumLikes = likes.slice(0, 3).reduce((a, b) => a + b, 0);

                    const sAbs = Math.min(100, (sumLikes / 600) * 100);
                    const sRel = Math.min(100, ((sumLikes / Math.max(100, views / Math.max(1, episodes))) / 0.06) * 100);

                    commentScore = Math.round(sAbs * 0.4 + sRel * 0.6);
                    commentText = `상위 베댓 추천합 ${this.fmt(sumLikes)}개`;
                    commentTooltip = `<div class="tip-header">💬 독자 상호작용 (추천순 정렬 수집)</div>` +
                        `상위 베스트 댓글 3개 추천 총합입니다.\n` +
                        `<span class="tip-sep">─────────────────────</span>\n` +
                        `베댓 추천합: ${this.fmt(sumLikes)}개\n` +
                        `반영 점수: ${commentScore}점`;
                }
            }

            const overall = Math.round(recScore * 0.25 + retScore * 0.25 + commentScore * 0.15 + cycleScore * 0.15 + halfLifeScore * 0.20);

            let rating = "복합적", rClass = "steam-color-mixed";
            if (overall >= 90) { rating = "압도적으로 긍정적"; rClass = "steam-color-positive"; }
            else if (overall >= 80) { rating = "매우 긍정적"; rClass = "steam-color-positive"; }
            else if (overall >= 70) { rating = "대체로 긍정적"; rClass = "steam-color-positive"; }
            else if (overall >= 40) { rating = "복합적"; rClass = "steam-color-mixed"; }
            else                     { rating = "대체로 애매함"; rClass = "steam-color-negative"; }

            return {
                rating, ratingClass: rClass, score: overall, recScore, retScore, commentScore, cycleScore, halfLifeScore, tagLabel,
                recRatioText: (recRatio * 100).toFixed(2) + "%", retentionRateText, commentText, cycleText, halfLifeText,
                subText: `전체 조회수 ${views >= 10000 ? (views/10000).toFixed(1)+'만':this.fmt(views)}회 중 추천 ${this.fmt(recs)}개`,
                recTooltip, retTooltip, commentTooltip, cycleTooltip, halfLifeTooltip
            };
        }
    };


    // =========================================================================
    // 3. 라이프사이클 컨텍스트 바인딩 및 이벤트 처리 (content.js 통합 및 변환)
    // =========================================================================

    // Tampermonkey GM 스토리지 기반으로 설정 연동
    let settings = {
        closeOnScroll: GM_getValue('closeOnScroll', true),
        tagAdjustEnabled: GM_getValue('tagAdjustEnabled', true)
    };

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

    // 초기 체크박스 상태 동기화
    document.getElementById('setting-close-on-scroll').checked = settings.closeOnScroll;
    document.getElementById('setting-tag-adjust').checked = settings.tagAdjustEnabled;

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

    // -------------------------------------------------------------------------
    // 모바일 터치 (Long Press) 분석 연동 핵심 처리부
    // -------------------------------------------------------------------------
    let touchTimer = null;
    let isLongPressActive = false;
    let startTouchX = 0;
    let startTouchY = 0;

    // 1. 표지 터치 다운 감지
    document.addEventListener('touchstart', (e) => {
        if (!isCoverImage(e.target)) return;

        const touch = e.touches[0];
        startTouchX = touch.clientX;
        startTouchY = touch.clientY;
        isLongPressActive = false;

        // 600ms 동안 계속 누르고 있으면 모달창 팝업 트리거
        touchTimer = setTimeout(() => {
            isLongPressActive = true;
            triggerAnalysis(e.target, startTouchX, startTouchY);
        }, 600);
    }, { passive: true });

    // 2. 터치 후 손가락 이동 제어 (스크롤 하려고 문지르면 롱프레스 취소)
    document.addEventListener('touchmove', (e) => {
        if (touchTimer) {
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - startTouchX) > 12 || Math.abs(touch.clientY - startTouchY) > 12) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        }
    }, { passive: true });

    // 3. 터치 업 제어 (롱프레스가 발동했다면 일반 탭 작동(상세페이지 이동 등) 방지)
    document.addEventListener('touchend', (e) => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
        if (isLongPressActive) {
            e.preventDefault();
        }
    }, { passive: false });

    // 4. 모바일 전용 분석창 정렬 및 계산 처리 함수
    async function triggerAnalysis(clickedEl, clientX, clientY) {
        hideTooltip();

        // 화면 하단 잘림을 방지하기 위한 안전 높이 계산 및 뷰포트 배치
        const modalWidth = Math.min(390, window.innerWidth * 0.9);
        const modalHeight = 440;

        let left = (window.innerWidth - modalWidth) / 2;
        let top = clientY + 15;

        if (top + modalHeight > window.innerHeight) {
            top = clientY - modalHeight - 15;
        }
        if (top < 10) top = 10;

        modal.style.width = `${modalWidth}px`;
        modal.style.left = `${left}px`;
        modal.style.top = `${top + window.scrollY}px`; // 스크롤 보정 포함
        modal.style.display = 'block';

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
                return;
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

    // 닫기 버튼 이벤트
    document.getElementById('steam-modal-close').addEventListener('click', () => { modal.style.display = 'none'; hideTooltip(); });

    // 5. 모바일 툴팁 대응 (터치 클릭 시 열림/닫힘 토글 처리)
    ['rec', 'ret', 'hl', 'comment', 'cycle'].forEach(k => {
        const row = document.getElementById(`steam-row-${k}`);

        row.addEventListener('click', (e) => {
            e.stopPropagation(); // 모달 외부 터치 이벤트 전파 방지

            if (tooltip.style.display === 'block' && tooltip.dataset.owner === k) {
                hideTooltip();
            } else {
                tooltip.dataset.owner = k;
                // 모달 내부 행의 중앙 위치를 잡아 툴팁 배치
                const rect = row.getBoundingClientRect();
                showTooltip(rect.left + (rect.width / 2), rect.top, row.dataset.tip);
            }
        });
    });

    // 6. 모달창이나 툴팁 밖의 빈 화면 터치 시 툴팁 및 분석창 외부 닫기 제어
    document.addEventListener('touchstart', (e) => {
        if (tooltip.style.display === 'block' && !tooltip.contains(e.target)) {
            hideTooltip();
        }
    }, { passive: true });

    document.getElementById('steam-modal-settings-btn').addEventListener('click', () => {
        const p = document.getElementById('steam-modal-settings');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });

    // 설정 값 변경 핸들러
    document.getElementById('setting-close-on-scroll').addEventListener('change', (e) => {
        settings.closeOnScroll = e.target.checked;
        GM_setValue('closeOnScroll', settings.closeOnScroll);
    });
    document.getElementById('setting-tag-adjust').addEventListener('change', (e) => {
        settings.tagAdjustEnabled = e.target.checked;
        GM_setValue('tagAdjustEnabled', settings.tagAdjustEnabled);
    });

    window.addEventListener('scroll', () => {
        if (settings.closeOnScroll && modal.style.display === 'block') {
            modal.style.display = 'none';
            hideTooltip();
        }
    }, { passive: true });
})();
