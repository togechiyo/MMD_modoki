import fs from "node:fs";
import path from "node:path";

const [, , sourceArgument, outputArgument, widthArgument = "2048",
    assetName = "YamagataField_20181231_1137",
    sourceUrl = "https://www.bandainamcostudios.com/projects/truehdri/library/16878"] = process.argv;

if (!sourceArgument || !outputArgument) {
    throw new Error(
        "Usage: node scripts/resize-radiance-hdr.mjs <source.hdr> <output.hdr> [width] [assetName] [sourceUrl]",
    );
}

const sourcePath = path.resolve(sourceArgument);
const outputPath = path.resolve(outputArgument);
const targetWidth = Number.parseInt(widthArgument, 10);
const source = fs.readFileSync(sourcePath);

const readLine = (start) => {
    const lineEnd = source.indexOf(0x0a, start);
    if (lineEnd < 0) {
        throw new Error("Unexpected end of Radiance HDR header");
    }
    const line = source.toString("ascii", start, lineEnd).replace(/\r$/, "");
    return { line, next: lineEnd + 1 };
};

let sourceOffset = 0;
let foundHeaderSeparator = false;
while (sourceOffset < source.length) {
    const result = readLine(sourceOffset);
    sourceOffset = result.next;
    if (result.line === "") {
        foundHeaderSeparator = true;
        break;
    }
}
if (!foundHeaderSeparator) {
    throw new Error("Radiance HDR header separator was not found");
}

let resolutionLine = "";
while (sourceOffset < source.length && resolutionLine === "") {
    const result = readLine(sourceOffset);
    sourceOffset = result.next;
    resolutionLine = result.line;
}

const resolutionMatch = /^-Y (\d+) \+X (\d+)$/.exec(resolutionLine);
if (!resolutionMatch) {
    throw new Error(`Unsupported Radiance HDR resolution: ${resolutionLine}`);
}

const sourceHeight = Number.parseInt(resolutionMatch[1], 10);
const sourceWidth = Number.parseInt(resolutionMatch[2], 10);
const targetHeight = Math.round(targetWidth * sourceHeight / sourceWidth);
const scaleX = sourceWidth / targetWidth;
const scaleY = sourceHeight / targetHeight;

if (
    !Number.isInteger(targetWidth)
    || targetWidth < 8
    || !Number.isInteger(scaleX)
    || !Number.isInteger(scaleY)
    || scaleX !== scaleY
) {
    throw new Error(
        `Only integer uniform downscaling is supported: ${sourceWidth}x${sourceHeight} -> ${targetWidth}x${targetHeight}`,
    );
}

const decodeScanline = (start) => {
    let offset = start;
    const markerA = source[offset++];
    const markerB = source[offset++];
    const widthHigh = source[offset++];
    const widthLow = source[offset++];
    const encodedWidth = (widthHigh << 8) | widthLow;
    if (markerA !== 2 || markerB !== 2 || encodedWidth !== sourceWidth) {
        throw new Error(`Unsupported Radiance scanline at byte ${start}`);
    }

    const channels = [
        new Uint8Array(sourceWidth),
        new Uint8Array(sourceWidth),
        new Uint8Array(sourceWidth),
        new Uint8Array(sourceWidth),
    ];

    for (const channel of channels) {
        let x = 0;
        while (x < sourceWidth) {
            const count = source[offset++];
            const value = source[offset++];
            if (count > 128) {
                const runLength = count - 128;
                if (runLength === 0 || x + runLength > sourceWidth) {
                    throw new Error(`Invalid Radiance RLE run at byte ${offset - 2}`);
                }
                channel.fill(value, x, x + runLength);
                x += runLength;
                continue;
            }

            const literalLength = count;
            if (literalLength === 0 || x + literalLength > sourceWidth) {
                throw new Error(`Invalid Radiance RLE literal at byte ${offset - 2}`);
            }
            channel[x++] = value;
            for (let index = 1; index < literalLength; index += 1) {
                channel[x++] = source[offset++];
            }
        }
    }

    return { channels, next: offset };
};

const encodeChannelRle = (channel) => {
    const bytes = [];
    let index = 0;
    while (index < channel.length) {
        let runLength = 1;
        while (
            index + runLength < channel.length
            && runLength < 127
            && channel[index + runLength] === channel[index]
        ) {
            runLength += 1;
        }

        if (runLength >= 4) {
            bytes.push(128 + runLength, channel[index]);
            index += runLength;
            continue;
        }

        const literalStart = index;
        while (index < channel.length && index - literalStart < 128) {
            runLength = 1;
            while (
                index + runLength < channel.length
                && runLength < 127
                && channel[index + runLength] === channel[index]
            ) {
                runLength += 1;
            }
            if (runLength >= 4) break;
            index += Math.min(runLength, 128 - (index - literalStart));
        }

        const literalLength = index - literalStart;
        bytes.push(literalLength);
        for (let offset = literalStart; offset < index; offset += 1) {
            bytes.push(channel[offset]);
        }
    }
    return bytes;
};

const toRgbe = (red, green, blue) => {
    const maximum = Math.max(red, green, blue);
    if (!Number.isFinite(maximum) || maximum <= 1e-32) {
        return [0, 0, 0, 0];
    }
    const exponent = Math.floor(Math.log2(maximum)) + 1;
    const scale = 256 / (2 ** exponent);
    return [
        Math.max(0, Math.min(255, Math.round(red * scale))),
        Math.max(0, Math.min(255, Math.round(green * scale))),
        Math.max(0, Math.min(255, Math.round(blue * scale))),
        exponent + 128,
    ];
};

const outputChunks = [];
const outputHeader = [
    "#?RADIANCE",
    `# Derived from Bandai Namco Studios TrueHDRI ${assetName}`,
    "SOFTWARE=MMD_modoki Radiance HDR resize script",
    "AUTHOR=Bandai Namco Studios Inc.",
    "CREDIT=Copyright Bandai Namco Studios Inc.",
    "LICENSE=CC0-1.0",
    `SOURCE_URL=${sourceUrl}`,
    `MODIFICATIONS=Linear box downsample from ${sourceWidth}x${sourceHeight} to ${targetWidth}x${targetHeight}`,
    "FORMAT=32-bit_rle_rgbe",
    "EXPOSURE=1.000000",
    "",
    `-Y ${targetHeight} +X ${targetWidth}`,
    "",
].join("\n");
outputChunks.push(Buffer.from(outputHeader, "ascii"));

const accumulation = new Float64Array(targetWidth * 3);
const sampleCount = scaleX * scaleY;
for (let sourceY = 0; sourceY < sourceHeight; sourceY += 1) {
    const decoded = decodeScanline(sourceOffset);
    sourceOffset = decoded.next;
    const [red, green, blue, exponent] = decoded.channels;

    for (let sourceX = 0; sourceX < sourceWidth; sourceX += 1) {
        const exponentValue = exponent[sourceX];
        if (exponentValue === 0) continue;
        const factor = 2 ** (exponentValue - 136);
        const targetX = Math.floor(sourceX / scaleX);
        const targetIndex = targetX * 3;
        accumulation[targetIndex] += red[sourceX] * factor;
        accumulation[targetIndex + 1] += green[sourceX] * factor;
        accumulation[targetIndex + 2] += blue[sourceX] * factor;
    }

    if ((sourceY + 1) % scaleY !== 0) continue;

    const outputChannels = [
        new Uint8Array(targetWidth),
        new Uint8Array(targetWidth),
        new Uint8Array(targetWidth),
        new Uint8Array(targetWidth),
    ];
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
        const targetIndex = targetX * 3;
        const rgbe = toRgbe(
            accumulation[targetIndex] / sampleCount,
            accumulation[targetIndex + 1] / sampleCount,
            accumulation[targetIndex + 2] / sampleCount,
        );
        for (let channel = 0; channel < 4; channel += 1) {
            outputChannels[channel][targetX] = rgbe[channel];
        }
    }

    outputChunks.push(Buffer.from([
        2,
        2,
        targetWidth >> 8,
        targetWidth & 0xff,
    ]));
    for (const channel of outputChannels) {
        outputChunks.push(Buffer.from(encodeChannelRle(channel)));
    }
    accumulation.fill(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat(outputChunks));
process.stdout.write(`${outputPath}\n`);
