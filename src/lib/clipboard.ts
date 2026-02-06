export async function copyToClipboard(text: string): Promise<boolean> {
  const cmd = process.platform === "darwin" ? "pbcopy" : "xclip -selection clipboard";

  try {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdin: "pipe",
    });
    proc.stdin.write(text);
    proc.stdin.end();
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}
