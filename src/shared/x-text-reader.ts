export const X_TEXT_HEADER = /^\s*xof\s+([0-9]{4})(txt|bin|tzip|bzip)\s+([0-9]{4})/i;

type Token = { t: "id" | "num" | "str" | "sym"; v: string };
const CHUNK_SIZE = 1024 * 1024;
const numberPattern = /[+-]?(?:\d+\.\d*|\d+|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?/y;
const identifierPattern = /[^\s{};,()[\]<>"]+/y;
const symbols = "{}<>[]()";

function countReplacementCharacters(bytes: Uint8Array, encoding: string): number {
    const decoder = new TextDecoder(encoding);
    let count = 0;
    for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, bytes.length);
        const text = decoder.decode(bytes.subarray(start, end), { stream: end < bytes.length });
        let at = text.indexOf("\uFFFD");
        while (at !== -1) {
            count += 1;
            at = text.indexOf("\uFFFD", at + 1);
        }
    }
    return count;
}

/** Decode bounded windows so even a text .x larger than V8's string limit can be read. */
export class XTextReader {
    private readonly source: string | Uint8Array;
    private readonly decoder: TextDecoder;
    private sourceOffset = 0;
    private text = "";
    private at = 0;
    private readonly pending: Token[] = [];

    public constructor(data: unknown) {
        if (typeof data === "string") {
            this.source = data;
            this.decoder = new TextDecoder();
        } else {
            if (data instanceof ArrayBuffer) this.source = new Uint8Array(data);
            else if (ArrayBuffer.isView(data)) this.source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            else throw new Error("X loader expects text data");
            const utf8Errors = countReplacementCharacters(this.source, "utf-8");
            const useShiftJis = utf8Errors > 0 && countReplacementCharacters(this.source, "shift-jis") < utf8Errors;
            this.decoder = new TextDecoder(useShiftJis ? "shift-jis" : "utf-8");
        }
        this.extend();
        const header = X_TEXT_HEADER.exec(this.text);
        if (!header) throw new Error("Invalid X header");
        if (header[2].toLowerCase() !== "txt") throw new Error("Unsupported X format '" + header[2] + "'");
        this.at = header[0].length;
    }

    // The unread byte count is a conservative upper bound on remaining characters.
    public get remainingLength(): number {
        return this.text.length - this.at + this.source.length - this.sourceOffset;
    }

    private extend(): boolean {
        if (this.sourceOffset === this.source.length) return false;
        const end = Math.min(this.sourceOffset + CHUNK_SIZE, this.source.length);
        const part = typeof this.source === "string"
            ? this.source.slice(this.sourceOffset, end)
            : this.decoder.decode(this.source.subarray(this.sourceOffset, end), { stream: end < this.source.length });
        this.text = this.text.slice(this.at) + part;
        this.at = 0;
        this.sourceOffset = end;
        return true;
    }

    private skipSeparators(): void {
        do {
            while (this.at < this.text.length) {
                const c = this.text.charCodeAt(this.at);
                if (c === 59 || c === 44 || c === 32 || (c >= 9 && c <= 13)
                    || (c > 127 && /\s/.test(this.text[this.at]))) {
                    this.at++;
                    continue;
                }
                if (c === 47 && this.at + 1 === this.text.length && this.extend()) continue;
                if (c !== 35 && !(c === 47 && this.text.charCodeAt(this.at + 1) === 47)) return;
                let eol = this.text.indexOf("\n", this.at);
                while (eol < 0) {
                    this.at = this.text.length;
                    if (!this.extend()) return;
                    eol = this.text.indexOf("\n");
                }
                this.at = eol + 1;
            }
        } while (this.extend());
    }

    private match(pattern: RegExp): string | null {
        for (;;) {
            pattern.lastIndex = this.at;
            const match = pattern.exec(this.text);
            if (!match) return null;
            // Include potential exponent/sign/suffix on the other side of a window boundary.
            if (pattern.lastIndex + 2 >= this.text.length && this.extend()) continue;
            this.at = pattern.lastIndex;
            return match[0];
        }
    }

    private scan(): Token | null {
        this.skipSeparators();
        if (this.at >= this.text.length) return null;
        const c = this.text[this.at];
        if (symbols.includes(c)) {
            this.at++;
            return { t: "sym", v: c };
        }
        if (c === '"') {
            // Keep the backslash on Windows paths except for escaped backslash/quote.
            let v = "";
            this.at++;
            for (;;) {
                if (this.at >= this.text.length && !this.extend()) return { t: "str", v };
                const ch = this.text[this.at++];
                if (ch === '"') return { t: "str", v };
                if (ch !== "\\") {
                    v += ch;
                    continue;
                }
                if (this.at >= this.text.length && !this.extend()) return { t: "str", v };
                const next = this.text[this.at++];
                v += next === "\\" || next === '"' ? next : "\\" + next;
            }
        }
        if (this.text.length - this.at < 4) this.extend();
        const num = this.match(numberPattern);
        if (num !== null) return { t: "num", v: num };
        const id = this.match(identifierPattern);
        if (id === null) throw new Error("Invalid X token");
        return { t: "id", v: id };
    }

    public peek(offset = 0): Token | null {
        while (this.pending.length <= offset) {
            const token = this.scan();
            if (!token) return null;
            this.pending.push(token);
        }
        return this.pending[offset];
    }

    public take(): Token | null {
        return this.pending.shift() ?? this.scan();
    }

    public number(): number {
        if (!this.pending.length) {
            this.skipSeparators();
            // Integer fields dominate large meshes. Avoid allocating a token per index.
            let end = this.at;
            let value = 0;
            let code = this.text.charCodeAt(end);
            while (code >= 48 && code <= 57) {
                value = value * 10 + code - 48;
                code = this.text.charCodeAt(++end);
            }
            if (end > this.at && end - this.at <= 15
                && (code === 59 || code === 44 || code === 32 || code === 10 || code === 13)) {
                this.at = end;
                return value;
            }
        }
        const token = this.take();
        if (!token || (token.t !== "id" && token.t !== "num")) throw new Error("Expected number");
        const value = Number(token.v.replace(/[fFdD]$/, ""));
        if (!Number.isFinite(value)) throw new Error("Invalid X number '" + token.v + "'");
        return value;
    }

    public count(valuesPerItem = 1): number {
        const count = this.number();
        if (!Number.isSafeInteger(count) || count < 0 || count > 0xffffffff
            || count * valuesPerItem > this.remainingLength) {
            throw new Error("Invalid X array count " + count);
        }
        return count;
    }
}
