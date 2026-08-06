/**
 * 1단계 요구사항: 호출 실패·타임아웃 예외 처리.
 *
 * 공공데이터포털은 인증키 오류 시 200 OK와 함께 JSON이 아닌 XML을 반환한다.
 * Content-Type 헤더를 믿으면 안 되고 본문 첫 글자를 직접 봐야 한다.
 */

/** @typedef {'timeout'|'network'|'http'|'format'|'service'|'config'} ApiErrorKind */

export class OpenApiError extends Error {
  /**
   * @param {ApiErrorKind} kind
   * @param {string} message
   * @param {string} [detail]
   */
  constructor(kind, message, detail) {
    super(message);
    this.name = "OpenApiError";
    this.kind = kind;
    this.detail = detail;
  }

  /** 운영자 화면에 표시할 한글 메시지 */
  get userMessage() {
    switch (this.kind) {
      case "timeout":
        return "응답 시간이 초과되었습니다. 공공데이터포털 응답 지연으로 보입니다.";
      case "network":
        return "데이터 제공 서버에 연결할 수 없습니다.";
      case "http":
        return `제공 서버가 오류를 반환했습니다. (${this.message})`;
      case "format":
        return "응답 형식이 올바르지 않습니다. 인증키가 등록되지 않았을 수 있습니다.";
      case "service":
        return `제공 서비스가 오류를 반환했습니다. (${this.message})`;
      case "config":
        return "서버에 인증키가 설정되지 않았습니다. .env 파일을 확인하세요.";
      default:
        return "알 수 없는 오류가 발생했습니다.";
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 타임아웃 + 지수 백오프 재시도를 적용한 JSON 호출.
 *
 * 재시도 정책: 타임아웃·네트워크 오류만 재시도한다.
 * 인증키 오류나 서비스 오류는 몇 번을 다시 불러도 결과가 같으므로
 * 즉시 중단해 일일 호출 한도를 낭비하지 않는다.
 *
 * @param {string} url
 * @param {{timeoutMs?: number, retries?: number}} [opts]
 */
export async function fetchJson(url, { timeoutMs = 5000, retries = 2 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new OpenApiError(
          "http",
          `HTTP ${res.status}`,
          body.slice(0, 300),
        );
      }

      const text = await res.text();

      // 인증키 미등록 시 200 OK + XML 본문이 온다.
      if (text.trimStart().startsWith("<")) {
        throw new OpenApiError(
          "format",
          "XML 오류 응답 수신",
          extractXmlMessage(text),
        );
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new OpenApiError("format", "JSON 파싱 실패", text.slice(0, 300));
      }
    } catch (err) {
      if (err instanceof OpenApiError) {
        // 재시도해도 같은 결과인 오류는 즉시 중단
        if (err.kind === "format" || err.kind === "service") throw err;
        lastError = err;
      } else if (err?.name === "AbortError") {
        lastError = new OpenApiError("timeout", `${timeoutMs}ms 초과`);
      } else {
        lastError = new OpenApiError(
          "network",
          err?.message ?? "알 수 없는 오류",
        );
      }

      if (attempt < retries) await sleep(300 * 2 ** attempt); // 300ms → 600ms
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new OpenApiError("network", "호출에 실패했습니다.");
}

function extractXmlMessage(xml) {
  const auth = xml.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1];
  const err = xml.match(/<errMsg>(.*?)<\/errMsg>/)?.[1];
  return [err, auth].filter(Boolean).join(" / ") || xml.slice(0, 200);
}

/** 인증키를 읽는다. 없으면 config 오류로 즉시 실패시켜 원인을 분명히 한다. */
export function serviceKey() {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key || key.startsWith("여기에")) {
    throw new OpenApiError("config", "DATA_GO_KR_SERVICE_KEY 미설정");
  }
  return key;
}
