/** Keep source paths unchanged while separating GPU/cache entries by encoded bytes. */
export async function textureContentKey(name: string, data: ArrayBuffer | Blob): Promise<string> {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    return `mmd-content-${hash}/${name}`;
}
