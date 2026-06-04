
# 🚂 Novelpia_Novel_Rating (노벨피아 스팀 스타일 연독/계산기)
[원작자 및 원본 보러가기](https://gall.dcinside.com/genrenovel/12346442)

노벨피아(Novelpia) 소설의 각종 지표(조회수, 추천수, 댓글, 연재 주기 등)를 분석하여 **스팀(Steam) 스타일의 다차원 종합 평점 및 시각화 바**를 제공하는 모듈형 프로젝트입니다. 사용자의 환경에 맞춰 크롬 확장 프로그램 또는 탬퍼몽키(Tampermonkey) 스크립트로 설치하여 사용할 수 있습니다.

---

## 📁 프로젝트 구조 (Repository Structure)

```text
├── extension/                  # 🧩 크롬 확장 프로그램 (Chrome Extension)
│   ├── manifest.json
│   ├── engine.js
│   ├── content.js
│   └── styles.css
│
├── tampermonkey/               # 🐒 유저스크립트 (Tampermonkey)
│   ├── tampermonkey(forPC).js       # PC용 (우클릭 발동 스크립트)
│   └── tampermonkey(forMobile).js   # 모바일용 (600ms 꾹 누르기 발동 스크립트)
│
└── README.md

```

---

## 🚀 설치 및 사용 방법 (Installation & Usage)

원하시는 환경에 맞는 설치 방법을 선택해 주세요.

### 1️⃣ 🧩 크롬 확장 프로그램 (Chrome Extension)

> **추천 대상:** PC 브라우저에서 스크립트 관리자 없이 독립된 확장 프로그램으로 깔끔하게 사용하고 싶으신 분

1. 이 저장소를 다운로드(Zip)하거나 `git clone`합니다.
2. 크롬 브라우저를 열고 주소창에 `chrome://extensions/`를 입력하여 이동합니다.
3. 우측 상단의 '개발자 모드'를 활성화합니다.
4. 좌측 상단의 **'압축해제된 확장 프로그램을 로드합니다'** 버튼을 클릭합니다.
5. 본 프로젝트의 `extension` 폴더를 선택하여 등록합니다.
6. **사용법:** 노벨피아 웹사이트에서 소설 표지 이미지를 **우클릭**하면 분석 모달이 표시됩니다.

### 2️⃣ 💻 PC용 Tampermonkey 유저스크립트

> **추천 대상:** Tampermonkey 확장 프로그램을 이미 사용 중이며, 단일 스크립트로 가볍게 관리하고 싶으신 분

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 확장 프로그램이 설치되어 있는지 확인합니다.
2. `tampermonkey/tampermonkey(forPC).js` 파일의 소스코드를 전체 복사합니다.
3. Tampermonkey 대시보드에서 새 스크립트 추가(+)를 누르고 코드를 붙여넣은 뒤 저장(`Ctrl + S`)합니다.
4. **사용법:** 노벨피아 웹사이트에서 소설 표지 이미지를 **우클릭**하면 분석 모달이 표시됩니다. (더블 우클릭 시 브라우저 기본 메뉴 열림)

### 3️⃣ 📱 모바일용 Tampermonkey 유저스크립트

> **추천 대상:** 키위 브라우저(Kiwi Browser) 등 모바일에서도 탬퍼몽키를 통해 연독률을 확인하고 싶으신 분

1. 모바일 환경에서 유저스크립트를 지원하는 브라우저(예: Kiwi Browser)를 설치하고 Tampermonkey 확장 프로그램을 추가합니다.
2. `tampermonkey/tampermonkey(forMobile).js` 파일의 소스코드를 전체 복사합니다.
3. 모바일 Tampermonkey에 새 스크립트로 추가하고 저장합니다.
4. **사용법:** 노벨피아 웹사이트에서 소설 표지 이미지를 약 **0.6초(600ms) 동안 꾹 누르고 있으면(Long Press)** 분석 모달이 표시됩니다.

---

## ⚠️ 주의 사항 (Disclaimer)

* 본 프로그램이 제공하는 평점 및 지표는 절대적인 작품의 우열을 가리는 기준이 아니며, 공개된 데이터 기반의 통계적 예측 분석 결과입니다.
* 노벨피아의 웹사이트 구조가 대대적으로 변경되거나 내부 API 사정이 바뀔 경우 데이터 파싱에 제한이 생길 수 있습니다.
