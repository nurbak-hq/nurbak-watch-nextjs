declare const __SDK_VERSION__: string | undefined;

export function getSdkVersion(): string {
  if (typeof __SDK_VERSION__ === 'string' && __SDK_VERSION__.length > 0) {
    return __SDK_VERSION__;
  }

  return '0.0.0';
}