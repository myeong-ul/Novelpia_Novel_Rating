// 스팀 스타일 연독/계산 알고리즘 핵심 엔진 모듈 (v1.9.1)
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
                recScore: 0, retScore: 0, commentScore: 0, cycleScore: 0, tagLabel: "",
                recRatioText: "0.0%", retentionRateText: "평가 부족 (조회수 1천 미만)",
                commentText: "-", cycleText: "-",
                subText: "조회수가 1,000 이상인 작품만 평가 시스템이 동작합니다.",
                recTooltip: "", retTooltip: "", commentTooltip: "", cycleTooltip: ""
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

        // ── 2. 연독률 및 연재 주기 분석 ──
        let retScore = 70, retentionRateText = "계산 불가", retTooltip = '';
        let cycleScore = 100, cycleText = "분석 불가", cycleTooltip = '';

        if (episodes > 1 && novelId) {
            try {
                let v4 = 0, vMidPrev = 0, vMid = 0, vEndPrev = 0, vEnd = 0;

                const epMid = Math.floor(episodes / 2);
                const epMidPrev = Math.max(1, epMid - 20);
                const epEnd = Math.max(1, episodes - 2);
                const epEndPrev = Math.max(1, epEnd - 20);

                const lastPageIndex = Math.floor((episodes - 1) / 20);
                const targetPages = [...new Set([
                    0,
                    Math.floor((epMidPrev - 1) / 20),
                    Math.floor((epMid - 1) / 20),
                    Math.floor((epEndPrev - 1) / 20),
                    Math.floor((epEnd - 1) / 20),
                    lastPageIndex
                ])];

                const rawEpisodesMap = {};
                const latestEpDates = [];
                let rawDateTexts = [];

                for (const pg of targetPages) {
                    const htmlPg = await this.postForm("/proc/episode_list", { "novel_no": novelId, "sort": "0", "page": pg.toString() });
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

                        if (pg === lastPageIndex) {
                            // [수정 핵심]: PLUS 배지(b) 필터링 및 날짜 전용 타겟 셀렉터 정교화
                            // 노벨피아 테이블에서 날짜는 보통 4번째 td 혹은 .ep_style2 클래스 내부에 위치합니다.
                            const dateEl = row.querySelector('.ep_style2 b:not([class*="plus"]), td.ep_style2, .date, .ep_date, td[width="12%"], td:nth-child(4)');

                            if (dateEl) {
                                // 만약 긁어온 엘리먼트 내부에 PLUS 관련 텍스트가 섞여있다면 제외 시도
                                let txt = dateEl.textContent.trim();

                                // 백업: 구조적 오매칭 시 정규식 패턴(숫자.숫자)이 들어있는 형제 요소를 재탐색
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
                }

                // 연독률 계산부
                const targetIndices = [4, epMidPrev, epMid, epEndPrev, epEnd];
                const codeListToFetch = targetIndices.map(i => rawEpisodesMap[i]).filter(Boolean);

                if (codeListToFetch.length > 0) {
                    const vrRaw = await this.postForm("/proc/novel", { "cmd": "get_episode_count_view", "episode_arr": codeListToFetch, "novel_no": novelId });
                    const vrData = JSON.parse(vrRaw);

                    if (vrData?.list?.length > 0) {
                        const viewsByCode = {};
                        vrData.list.forEach(v => {
                            viewsByCode[v.episode_no] = parseInt(v.count_view.replace(/,/g, '')) || 0;
                        });
                        v4 = viewsByCode[rawEpisodesMap[4]] || 0;
                        vMidPrev = viewsByCode[rawEpisodesMap[epMidPrev]] || 0;
                        vMid = viewsByCode[rawEpisodesMap[epMid]] || 0;
                        vEndPrev = viewsByCode[rawEpisodesMap[epEndPrev]] || 0;
                        vEnd = viewsByCode[rawEpisodesMap[epEnd]] || 0;
                    }
                }

                if (episodes >= 40 && vMidPrev > 0 && vEndPrev > 0 && v4 > 0) {
                    const midRetention = vMid / vMidPrev;
                    const endRetention = vEnd / vEndPrev;
                    const totalRetention = vEnd / v4;

                    const scoreMid = Math.min(100, Math.round(midRetention * 100));
                    const scoreEnd = Math.min(100, Math.round(endRetention * 100));
                    const scoreTotal = episodes >= 80 ? Math.min(100, Math.round(totalRetention * 100 * 2.5)) : Math.min(100, Math.round(totalRetention * 100 * 1.2));

                    retScore = Math.max(0, Math.min(100, Math.round((scoreMid * 0.3) + (scoreEnd * 0.5) + (scoreTotal * 0.2))));
                    retentionRateText = `최근 유지력: ${(endRetention * 100).toFixed(1)}%`;
                    retTooltip = `<div class="tip-header">📈 중/장편 구간 연독률</div>허리 연독: ${(midRetention * 100).toFixed(1)}%\n후반 유지: ${(endRetention * 100).toFixed(1)}%\n초반 대비 생존: ${(totalRetention * 100).toFixed(1)}%` +
                        `\n<span class="tip-sep">─────────────────────</span>\n` +
                        `가중치 반영: 허리 30% + 후반 50% + 전체 20%\n` +
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

                // 연재 주기 판단부
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
            const processedId = new Set(); // 중복 파싱 방지 보틀넥 필터

            commentRows.forEach(el => {
                // 대댓글(답글)이거나 이미 처리한 댓글 아이디 패스
                if (el.classList.contains('comment_re')) return;
                const cId = el.getAttribute('id') || el.dataset.id;
                if (cId && processedId.has(cId)) return;
                if (cId) processedId.add(cId);

                const m = el.querySelector('[id^="comment_vote_"]')?.textContent.match(/추천\s*\((\d+)\s*건\)/);
                if (m) likes.push(parseInt(m[1]));
            });

            if (likes.length > 0) {
                // 가장 추천이 많은 상위 베댓 정렬
                likes.sort((a, b) => b - a);
                sumLikes = likes.slice(0, 3).reduce((a, b) => a + b, 0);

                // 추천순 강제 정렬 피드백 반영 점수 스케일링 보정
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

        const overall = Math.round(recScore * 0.3 + retScore * 0.3 + commentScore * 0.2 + cycleScore * 0.2);
        let rating = "복합적", rClass = "steam-color-mixed";
        if (overall >= 90) { rating = "압도적으로 긍정적"; rClass = "steam-color-positive"; }
        else if (overall >= 80) { rating = "매우 긍정적"; rClass = "steam-color-positive"; }
        else if (overall >= 70) { rating = "대체로 긍정적"; rClass = "steam-color-positive"; }
        else if (overall >= 40) { rating = "복합적"; rClass = "steam-color-mixed"; }
        else                     { rating = "대체로 애매함"; rClass = "steam-color-negative"; }

        return {
            rating, ratingClass: rClass, score: overall, recScore, retScore, commentScore, cycleScore, tagLabel,
            recRatioText: (recRatio * 100).toFixed(2) + "%", retentionRateText, commentText, cycleText,
            subText: `전체 조회수 ${views >= 10000 ? (views/10000).toFixed(1)+'만':this.fmt(views)}회 중 추천 ${this.fmt(recs)}개`,
            recTooltip, retTooltip, commentTooltip, cycleTooltip
        };
    }
};