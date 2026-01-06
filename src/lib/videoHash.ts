/**
 * 视频文件哈希计算工具
 * 使用 Web Crypto API (SHA-256) 计算视频内容哈希
 *
 * 对于大文件采用"首尾采样+文件大小"的快速哈希方案：
 * - 小于 2MB：哈希整个文件
 * - 大于 2MB：哈希前 1MB + 后 1MB + 文件大小
 */

const CHUNK_SIZE = 1024 * 1024; // 1MB

/**
 * 将 ArrayBuffer 转换为十六进制字符串
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 计算 ArrayBuffer 的 SHA-256 哈希
 */
async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToHex(hashBuffer);
}

/**
 * 计算文件的快速哈希
 * 对于大文件，只取首尾各 1MB + 文件大小进行哈希，大幅提升速度
 */
export async function computeQuickHash(file: File): Promise<string> {
  if (file.size < CHUNK_SIZE * 2) {
    // 小文件：哈希整个文件
    const buffer = await file.arrayBuffer();
    return hashArrayBuffer(buffer);
  }

  // 大文件：哈希前 1MB + 后 1MB + 文件大小
  const firstChunk = await file.slice(0, CHUNK_SIZE).arrayBuffer();
  const lastChunk = await file.slice(-CHUNK_SIZE).arrayBuffer();

  // 合并数据：首部 + 尾部 + 文件大小字符串
  const sizeBytes = new TextEncoder().encode(file.size.toString());
  const combined = new Uint8Array(firstChunk.byteLength + lastChunk.byteLength + sizeBytes.byteLength);
  combined.set(new Uint8Array(firstChunk), 0);
  combined.set(new Uint8Array(lastChunk), firstChunk.byteLength);
  combined.set(sizeBytes, firstChunk.byteLength + lastChunk.byteLength);

  return hashArrayBuffer(combined.buffer);
}

/**
 * 计算文件的完整哈希（遍历整个文件）
 * 适用于需要精确比对的场景
 */
export async function computeFullHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return hashArrayBuffer(buffer);
}

/**
 * 视频哈希信息
 */
export interface VideoHashInfo {
  hash: string;
  fileName: string;
  fileSize: number;
}

/**
 * 计算视频文件的哈希信息
 */
export async function computeVideoHash(file: File): Promise<VideoHashInfo> {
  const hash = await computeQuickHash(file);
  return {
    hash,
    fileName: file.name,
    fileSize: file.size,
  };
}
