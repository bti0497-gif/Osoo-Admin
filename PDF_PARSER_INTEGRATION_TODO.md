# PDF 파서 통합 TODO

## 완료된 작업
- [x] 버튼 텍스트 변경: '추출 ZIP 업로드' → '성적서 올리기'
- [x] 필요 라이브러리 설치 (react-pdf, lucide-react)
- [x] PDF 파싱 컴포넌트 분리 (위젯처럼 관리 가능)
- [x] PDF 업로드 모달 컴포넌트 생성
- [x] PDF 파싱 로직 (TypeScript → JavaScript 변환)
- [x] CertificateView에 PDF 파서 모달 통합
- [x] 서버에 /api/generate-content 엔드포인트 추가 (Gemini API)
- [x] 이미지 이름 명명 규칙 적용 (기존 코드와 일치)
- [x] 모달 대신 새창으로 웹앱 띄우기
- [x] waterquality-analyzer 서버에 API key 설정
- [x] 웹앱에서 기존 엔드포인트 사용하여 이미지는 Drive에, JSON은 BigQuery에 전송
- [x] waterquality-analyzer 폴더를 Wastewater Treatment Plant Admin 프로젝트로 이동

## 남은 작업
- [ ] waterquality-analyzer 폴더에서 패키지 설치 (`npm install`)
- [ ] 웹앱 빌드 (`npm run build`)
- [ ] 빌드된 파일을 메인 앱의 `public/pdf-parser` 폴더로 복사
- [ ] 메인 앱 서버에서 웹앱 제공하도록 설정 (`server/index.cjs`)
- [ ] CertificateView에서 웹앱 URL을 로컬 URL로 변경 (`http://localhost:8901/pdf-parser`)
- [ ] 테스트: 성적서 올리기 버튼 클릭 → 웹앱 뜸 → PDF 선택 → 파싱 → 전송

## 상세 작업 단계

### 1. 패키지 설치
```bash
cd waterquality-analyzer
npm install
```

### 2. 웹앱 빌드
```bash
npm run build
```

### 3. 빌드된 파일 복사
```bash
mkdir public/pdf-parser
xcopy dist\* public\pdf-parser\ /E /I /H /Y
```

### 4. 서버 설정 수정 (`server/index.cjs`)
```javascript
app.use('/pdf-parser', express.static(path.join(BASE_DIR, 'public', 'pdf-parser')));
```

### 5. CertificateView URL 수정 (`src/features/certificate/CertificateView.jsx`)
```javascript
const handleOpenPdfParser = () => {
    window.open('http://localhost:8901/pdf-parser', '_blank');
};
```

### 6. 웹앱에서 메인 앱 서버 URL 수정 (`waterquality-analyzer/src/App.tsx`)
이미 `http://localhost:8901`로 설정되어 있음 (변경 필요 없음)
