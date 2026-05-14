import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const upload = multer({ dest: "/tmp/uploads/" });

// Note: You must ensure GEMINI_API_KEY is available.
let _defaultAi: GoogleGenAI | null = null;
function getAI(customKey?: string) {
  if (customKey) {
    return new GoogleGenAI({ apiKey: customKey });
  }
  if (!_defaultAi) {
    _defaultAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "dummy" });
  }
  return _defaultAi;
}

async function startServer() {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Generic Gemini API Proxy Route to avoid frontend API key referrer restrictions
  app.post("/api/generate-content", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
         return res.status(400).json({ error: "No file uploaded" });
      }

      const fileData = fs.readFileSync(req.file.path);
      const base64Data = fileData.toString("base64");
      
      const prompt = req.body.prompt || "";
      const model = req.body.model || "gemini-2.5-flash";

      const customKey = req.headers["x-custom-api-key"] as string | undefined;
      const response = await getAI(customKey).models.generateContent({
        model: model,
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: req.file.mimetype || "image/jpeg"
            }
          }
        ],
      });

      fs.unlinkSync(req.file.path);

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error details:", error.status, error.message);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // API Route to process the uploaded PDF page
  app.post("/api/process-water-quality", upload.single("pdfPage"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log("Processing uploaded file:", req.file.path);
      // In a real scenario, this 'pdfPage' might be an image sent from the frontend 
      // or the PDF itself. Since the user wants to minimize API calls by only reading 
      // specific parts, we can let the frontend send an image rendering of the page,
      // and use Gemini to extract the data.

      // We'll read the uploaded file
      const fileData = fs.readFileSync(req.file.path);
      const base64Data = fileData.toString("base64");

      // 1. Extract data using Gemini
      const pageNumber = req.body.pageNumber || '1';
      let boxesMeta = "";
      try {
        const boxes = JSON.parse(req.body.boxes);
        boxesMeta = `\n[참고: 사용자가 지정한 ROI 영역 좌표]
${JSON.stringify(boxes, null, 2)}
위 좌표를 참고해 현 화면에서 사용자가 지정한 각각의 영역 위치 안의 텍스트를 우선 대상으로 분석하라.`;
      } catch(e){}

      const prompt = `
너는 "수질 성적서 ROI 추출기"다.
전체 문서를 해석하지 말고, 오직 제출된 PDF 문서의 **[ ${pageNumber} 번째 페이지 ]** 내용만 타겟으로 하여 결과를 JSON으로 반환하라.
${boxesMeta}

[입력 데이터]
(모델 참고: 첨부된 PDF 문서 전체 중 오직 **${pageNumber} 페이지**만을 분석 범위로 제한한다. 다른 페이지의 데이터는 절대 섞거나 추출하지 마라. 
위 ROI 박스 좌표로 지정된 위치의 텍스트를 최우선으로 추출하고, 만약 좌표가 빈 값이면 해당 ${pageNumber} 페이지 전체 문맥에서 아래 항목을 도출하라)
- date_text: ${pageNumber}페이지 내 날짜 ROI영역 내부 안의 OCR 텍스트 
- location_text: ${pageNumber}페이지 내 현장명 ROI영역 내부 안의 OCR 텍스트
- items_text: ${pageNumber}페이지 내 분석항목 ROI영역 내부의 OCR 텍스트
- results_text: ${pageNumber}페이지 내 분석결과 ROI영역 내부의 OCR 텍스트

[핵심 규칙]
1) 출력은 오직 JSON만 (설명/마크다운 금지)
2) report_date는 반드시 YYYY-MM-DD
3) 저장 대상은 report_date >= 2026-01-01 만 허용
   - 그 이전이면 include=false, reason에 "before_2026_01"
4) 항목명은 아래 표준 키로만 매핑:
   - SS(부유물질) -> ss
   - BOD(생물학적산소요구량) -> bod
   - TN(총질소) -> tn
   - TP(총인) -> tp
   - 총대장균군 -> total_coliform
   - MLSS(미생물농도) -> mlss
   - DO -> do
   - PH/pH -> ph
5) 숫자 파싱:
   - 숫자만 추출 (쉼표 제거)
   - '<', '이하', '미만', '불검출', '-', 공란 등은 null 처리
6) location_text에서 현장명(site_name) 추출
   - site_id는 추론하지 말고 null로 둔다 (별도 매핑 시스템에서 채움)
7) confidence는 0~1
8) 항목/결과 개수가 맞지 않으면 가능한 범위만 매핑하고 warnings에 남긴다

[출력 스키마 - 반드시 동일한 키 사용]
{
  "include": true,
  "reason": "ok",
  "source": {
    "source_pdf_name": "${req.file.originalname}",
    "page_index": ${pageNumber}
  },
  "record": {
    "report_date": "YYYY-MM-DD|null",
    "site_name": "string|null",
    "site_id": null,
    "ss": null,
    "bod": null,
    "tn": null,
    "tp": null,
    "total_coliform": null,
    "mlss": null,
    "do": null,
    "ph": null
  },
  "meta": {
    "confidence": 0.0,
    "warnings": []
  }
}

[파싱 절차]
A. date_text에서 날짜 1개를 추출해 report_date로 표준화
B. location_text에서 현장명 후보를 추출해 site_name으로 설정
C. items_text 줄 목록과 results_text 줄 목록을 같은 순서로 매칭
D. 항목명을 표준 키로 변환해 record에 값 채움
E. 날짜 필터(2026-01-01) 적용 후 include/reason 결정

[항목명 동의어 예시]
- "부유물질", "SS" -> ss
- "생물학적 산소요구량", "BOD" -> bod
- "총질소", "T-N", "TN" -> tn
- "총인", "T-P", "TP" -> tp
- "총대장균군", "대장균군" -> total_coliform
- "미생물농도", "MLSS" -> mlss
- "용존산소", "DO" -> do
- "수소이온농도", "PH", "pH" -> ph
`;

      // Depending on if the frontend sends an image or pdf for the specific page
      // Assuming frontend sends an image blob or PNG for the active page to save processing
      const customKey = req.headers["x-custom-api-key"] as string | undefined;
      const response = await getAI(customKey).models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: req.file.mimetype || "application/pdf"
            }
          }
        ],
      });

      const textOutput = response.text || "{}";
      const cleanJson = textOutput.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
      let extractedData;
      try {
        extractedData = JSON.parse(cleanJson);
      } catch (e) {
        console.error("Failed to parse Gemini output:", cleanJson);
        extractedData = { raw: textOutput };
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        message: "Processing complete",
        extracted: extractedData
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
