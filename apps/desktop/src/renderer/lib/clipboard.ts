export async function copyDataImage(src: string): Promise<void> {
  const source = await fetch(src).then((response) => response.blob());
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not copy image"))), "image/png"),
  );
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
