import { FileToolsOptions } from "@babylonjs/core/Misc/fileTools";
import { toLocalAssetUrl } from "../shared/local-asset-url";

let localAssetRoutingInstalled = false;

export function resolveRendererAssetUrl(url: string): string {
  return import.meta.env.DEV ? toLocalAssetUrl(url) : url;
}

export function installLocalAssetRouting(): void {
  if (!import.meta.env.DEV || localAssetRoutingInstalled) return;

  const previousPreprocessUrl = FileToolsOptions.PreprocessUrl;
  FileToolsOptions.PreprocessUrl = (url) => resolveRendererAssetUrl(
    previousPreprocessUrl.call(FileToolsOptions, url),
  );
  localAssetRoutingInstalled = true;
}
