import { kmaAdapter } from './kma.js';
import { airKoreaAdapter } from './airkorea.js';

/**
 * 등록된 어댑터 목록.
 * 새 Open API를 추가하려면 어댑터 파일 하나를 만들고 이 배열에 넣기만 하면 된다.
 */
export const ADAPTERS = [kmaAdapter, airKoreaAdapter];

export const ADAPTER_BY_ID = new Map(ADAPTERS.map((a) => [a.id.toLowerCase(), a]));

export { kmaAdapter, airKoreaAdapter };
