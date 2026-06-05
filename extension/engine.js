// 스팀 스타일 연독/계산 알고리즘 핵심 엔진 모듈 (v2.0.0 - 전수조사 기반 정밀 반감기 버전)
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
                // 1) 전체 페이지 목록 생성 (페이지당 20화씩 노출 기준)
                const totalPagesCount = Math.ceil(episodes / 20);
                const allPageIndices = Array.from({ length: totalPagesCount }, (_, i) => i);

                // 고속 병렬 패치 실행
                const pagesHtmlArray = await Promise.all(
                    allPageIndices.map(pg => this.postForm("/proc/episode_list", { "novel_no": novelId, "sort": "0", "page": pg.toString() }))
                );

                // 에피소드 고유 코드를 수집할 임시 객체 및 연재일 배열
                const rawEpisodesMap = {};
                const latestEpDates = [];
                let rawDateTexts = [];

                // 최신 페이지(마지막 인덱스) 판정용
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

                        // 최신 연재 주기 추적용 (최신화들이 있는 마지막 페이지에서 날짜 파싱)
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

                // 2) [전수조사] 수집된 모든 화수의 코드를 순서대로 매핑하여 안전하게 청크 단위 분할 요청
                const allCollectedIndices = Object.keys(rawEpisodesMap).map(Number).sort((a,b) => a - b);
                const codeListToFetch = allCollectedIndices.map(i => rawEpisodesMap[i]).filter(Boolean);

                const allViewsMap = {}; // epIndex -> 순수 조회수 변환 맵

                if (codeListToFetch.length > 0) {
                    // ── [대장편 서버 에러 해결] 100개씩 안전한 크기로 쪼개서 분할 요청 ──
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

                            // 혹시 서버가 일시적으로 에러 HTML을 뱉으면 JSON 파싱 예외 처리로 우회
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
                        // 결과 꼬임 방지를 위한 코드 매핑 역추적 역산
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

                // 3) 핵심 지표용 특정 화수 추출 (기존 연독률 로직 완벽 연동 목적)
                const v1 = allViewsMap[1] || 0;
                const v4 = allViewsMap[4] || 0;
                // ── [업데이트] 유동적 연독률 구간 설정 (총 화수의 20% / 최소 20화 ~ 최대 40화 변동식) ──
                const rawRange = Math.round(episodes * 0.2);
                const windowSize = Math.max(20, Math.min(40, rawRange)); // 최소 20, 최대 40 제한

                const epEnd = Math.max(1, episodes - 2);
                const epEndPrev = Math.max(1, epEnd - windowSize); // 완결/최신화 기준 뒤로 windowSize만큼
                const epMid = Math.floor(episodes / 2);
                const epMidPrev = Math.max(1, epMid - windowSize); // 허리 지점 기준 뒤로 windowSize만큼

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

                // ── [업데이트] 절대 기준점 기반 정밀 반감기 점수 스케일러 (4화-15화-30화 맵핑) ──
                if (v1 > 0 && v4 > 0) {
                    let hl1 = "유지됨", hl1Ep = episodes;
                    let hl4 = "유지됨", hl4Ep = episodes;

                    // 1화 기준 전수 필터링
                    for (let i = 1; i <= episodes; i++) {
                        const currentView = allViewsMap[i];
                        if (currentView && currentView <= v1 * 0.5) {
                            hl1 = `${i}화`;
                            hl1Ep = i;
                            break;
                        }
                    }

                    // 4화 기준 전수 필터링
                    for (let i = 4; i <= episodes; i++) {
                        const currentView = allViewsMap[i];
                        if (currentView && currentView <= v4 * 0.5) {
                            const diff = i - 4;
                            hl4 = `+${diff}화 뒤 (${i}화)`;
                            hl4Ep = diff;
                            break;
                        }
                    }

                    // 1화 반감 지표 점수 환산 함수 (망작4화 / 반짝15화 / 평작30화 타겟팅)
                    function getHl1Score(ep) {
                        if (ep === "유지됨" || ep > 30) {
                            // 30화 초과하여 완결 혹은 유지 중인 갓작 구간 (81 ~ 100점)
                            if (ep === "유지됨") return 100;
                            const extra = Math.min(19, Math.round(((ep - 30) / Math.max(1, episodes - 30)) * 19));
                            return 81 + extra;
                        }
                        if (ep <= 4) {
                            // 4화 이하 폭망 구간 (10 ~ 30점 분포)
                            return Math.round(10 + (ep / 4) * 20);
                        }
                        if (ep <= 15) {
                            // 5화 ~ 15화 초반 반짝 소재런 구간 (31 ~ 60점 분포)
                            const pct = (ep - 4) / (15 - 4);
                            return Math.round(31 + pct * 29);
                        }
                        // 16화 ~ 30화 무난한 평작 구간 (61 ~ 80점 분포)
                        const pct = (ep - 15) / (30 - 15);
                        return Math.round(61 + pct * 19);
                    }

                    // 4화 기준 반감 지표 점수 환산 (상대적 거리 고려 보정)
                    function getHl4Score(diff) {
                        if (diff === "유지됨" || diff > 26) return 100; // 4화에서 26화 이상(합산 30화) 유지 시 만점형
                        if (diff <= 1) return 15; // 4화 바로 다음 터짐
                        if (diff <= 11) { // 15화 구간 안쪽 타겟팅
                            const pct = (diff - 1) / (11 - 1);
                            return Math.round(35 + pct * 25);
                        }
                        const pct = (diff - 11) / (26 - 11); // 30화 구간 안쪽 타겟팅
                        return Math.round(61 + pct * 20);
                    }

                    const sHl1 = hl1 === "유지됨" ? 100 : getHl1Score(hl1Ep);
                    const sHl4 = hl4 === "유지됨" ? 100 : getHl4Score(hl4Ep);

                    // 유지 지표 종합 스코어
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

                // 연재 주기 판단부 (v1.9.1 기존 로직 완벽 유지)
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

        // ── 3. 베댓 상호작용 점수 ──
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

        // 가중치 비중: 추천비(25%) + 연독률(25%) + 상호작용(15%) + 연재주기(15%) + 독자유지력(20%) = 100%
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